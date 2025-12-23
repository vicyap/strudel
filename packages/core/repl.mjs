import { NeoCyclist } from './neocyclist.mjs';
import { Cyclist } from './cyclist.mjs';
import { evaluate as _evaluate } from './evaluate.mjs';
import { errorLogger, logger } from './logger.mjs';
import { setTime } from './time.mjs';
import { evalScope } from './evaluate.mjs';
import { register, Pattern, isPattern, silence, stack } from './pattern.mjs';
import { reset_state } from './impure.mjs';

export function repl({
  defaultOutput,
  onEvalError,
  beforeEval,
  beforeStart,
  afterEval,
  getTime,
  transpiler,
  onToggle,
  editPattern,
  onUpdateState,
  sync = false,
  setInterval,
  clearInterval,
  id,
  mondo = false,
}) {
  const state = {
    schedulerError: undefined,
    evalError: undefined,
    code: '// LOADING',
    activeCode: '// LOADING',
    pattern: undefined,
    miniLocations: [],
    widgets: [],
    sliders: [],
    pending: false,
    started: false,
  };

  const transpilerOptions = {
    id,
  };

  const updateState = (update) => {
    Object.assign(state, update);
    state.isDirty = state.code !== state.activeCode;
    state.error = state.evalError || state.schedulerError;
    onUpdateState?.(state);
  };

  const schedulerOptions = {
    onTrigger: getTrigger({ defaultOutput, getTime }),
    getTime,
    onToggle: (started) => {
      updateState({ started });
      onToggle?.(started);
      if (!started) {
        reset_state();
      }
    },
    setInterval,
    clearInterval,
    beforeStart,
  };

  // NeoCyclist uses a shared worker to communicate between instances, which is not supported on mobile chrome
  const scheduler =
    sync && typeof SharedWorker != 'undefined' ? new NeoCyclist(schedulerOptions) : new Cyclist(schedulerOptions);
  let pPatterns = {};
  let anonymousIndex = 0;
  let allTransform;
  let eachTransform;

  // Block-based evaluation state
  let codeBlocks = {};
  let lastActiveVisualizerLabel = null;
  // Track which patterns belong to which blocks: { blockRange: [patternKeys] }
  let blockPatterns = new Map();

  // Helper function to collect properties from all code blocks (handles both labeled and anonymous blocks)
  function collectFromBlocks(property) {
    return Object.entries(codeBlocks).flatMap(([key, block]) => {
      if (key === '$') {
        // Anonymous blocks are stored as an array of block objects
        return Array.isArray(block) ? block.flatMap((b) => b[property] || []) : [];
      }
      // Labeled blocks are stored as single block objects
      return block[property] || [];
    });
  }

  // Helper function to process a single labeled block
  function processLabeledBlock(labels, i, code, options, meta) {
    const label = labels[i];
    const nextLabel = labels[i + 1] || { index: code.length, end: code.length };

    const labelCode = code.slice(label.index, nextLabel.index);
    const labelRange = [label.index + options.range[0], label.end + options.range[0]];

    // Calculate the full block range (from label start to next label start)
    const blockStart = label.index + options.range[0];
    const blockEnd = nextLabel.index + options.range[0];

    const blockWidgets = (meta?.widgets || []).filter((widget) => {
      const widgetPos = widget.from ?? widget.index ?? 0;
      return widgetPos >= blockStart && widgetPos < blockEnd;
    });

    const blockSliders = (meta?.sliders || []).filter((slider) => {
      const sliderPos = slider.from ?? slider.index ?? 0;
      return sliderPos >= blockStart && sliderPos < blockEnd;
    });

    const blockMiniLocations = (meta?.miniLocations || []).filter((loc) => {
      // const locStart = loc.start ?? loc.from ?? 0;
      // mini locations can be either [start, end] arrays or objects with start/from
      const locStart = Array.isArray(loc) ? loc[0] : (loc.start ?? loc.from ?? 0);
      return locStart >= blockStart && locStart < blockEnd;
    });

    handleSingleLabelBlock(
      label,
      labelCode,
      { ...options, range: labelRange },
      { widgets: blockWidgets, sliders: blockSliders, miniLocations: blockMiniLocations },
    );
  }

  // // Helper function to filter meta (widgets, sliders, miniLocations) by block range
  // function splitCodeByRange(meta, blockStart, blockEnd) {
  // }

  // Helper function to extract labels from code with their positions
  function extractLabelsFromCode(code) {
    const labels = [];
    // Regex to find label patterns like "d1:" or "myLabel:"
    const labelRegex = /^(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:)/gm;
    let match;
    while ((match = labelRegex.exec(code)) !== null) {
      labels.push({
        name: match[2],
        index: match.index,
        end: match.index + match[1].length,
        fullMatch: match[1],
      });
    }

    // Also check for 'all()' and treat it as a special label
    // just for management purposes
    const allRegex = /all\s*\(\s*([^)]+)\s*\)/;
    const allMatch = allRegex.exec(code);
    if (allMatch) {
      // Check if the argument contains a widget call
      const argCode = allMatch[1];
      const activeVisualizer = detectActiveVisualizer(argCode);

      labels.push({
        name: 'all',
        index: allMatch.index,
        end: allMatch.index + allMatch[0].length,
        fullMatch: allMatch[0],
        activeVisualizer: activeVisualizer,
      });
    }

    return labels;
  }

  // Helper function to detect non-inline widget calls in code
  function detectActiveVisualizer(code) {
    // List of non-inline widgets that need cleanup
    // These are Pattern.prototype methods that create persistent visualizations
    // I don't like this approach, feels hacky, but since these methods don't create ids that
    // can be read through the transpiler, I'm not sure how best to detect them.
    // Would probably be better to register these methods through some function that would 
    // tag them better
    const nonInlineWidgets = ['punchcard', 'spiral', 'scope', 'pitchwheel', 'spectrum', 'pianoroll', 'wordfall',];

    for (const widget of nonInlineWidgets) {
      const widgetRegex = new RegExp(`\\.${widget}\\s*\\(`);
      if (widgetRegex.test(code)) {
        return widget;
      }
    }
    return null;
  }

  // Helper function to handle single label code block storage
  function handleSingleLabelBlock(label, code, options, meta) {

    // Detect if this block contains a non-inline widget
    // For 'all' label, widget info is already on the label object from extractLabelsFromCode

    // As mentioned in detectActiveVisualizer, this is a bad approach to 
    // managing non-inline widgets (or widgets that don't have ids)
    // and a proper solution would give them widgets in the transpiler, or at least
    // track where they are so we don't have to futz around with regexes
    const activeVisualizer = label.activeVisualizer !== undefined
      ? label.activeVisualizer
      : detectActiveVisualizer(code);

    if (activeVisualizer !== null) {
      lastActiveVisualizerLabel = label.name;
    }

    // Store the entire code block under the label name
    codeBlocks[label.name] = {
      code: code,
      range: options.range,
      labels: [label.name],
      miniLocations: meta?.miniLocations || [],
      widgets: meta?.widgets || [],
      sliders: meta?.sliders || [],
      activeVisualizer: activeVisualizer, // Store the widget type if present, null otherwise
    };


    // Clean up any blocks with conflicting ranges
    for (const [existingKey, existingBlock] of Object.entries(codeBlocks)) {
      if (existingKey !== label.name && existingBlock.range && options.range) {
        const [existingStart, existingEnd] = existingBlock.range;
        const [newStart, newEnd] = options.range;

        // If ranges overlap (not just touch), remove the stale block
        if (!(newEnd <= existingStart || newStart >= existingEnd)) {
          delete codeBlocks[existingKey];
        }
      }
    }
  }

  const hush = function () {
    pPatterns = {};
    anonymousIndex = 0;
    allTransform = undefined;
    eachTransform = undefined;
    codeBlocks = {};
    blockPatterns.clear();
    lastActiveVisualizerLabel = null; // Reset 'all' visualizer tracking
    return silence;
  };

  // helper to get a patternified pure value out
  function unpure(pat) {
    if (pat._Pattern) {
      return pat.__pure;
    }
    return pat;
  }

  const setPattern = async (pattern, autostart = true) => {
    pattern = editPattern?.(pattern) || pattern;
    await scheduler.setPattern(pattern, autostart);
    return pattern;
  };
  setTime(() => scheduler.now()); // TODO: refactor?

  const stop = () => {
    codeBlocks = {};
    blockPatterns.clear();
    pPatterns = {};
    lastActiveVisualizerLabel = null; // Reset 'all' visualizer tracking
    updateState({
      miniLocations: [],
      widgets: [],
      sliders: [],
    });
    scheduler.stop();
  };
  const start = () => scheduler.start();
  const pause = () => scheduler.pause();
  const toggle = () => scheduler.toggle();
  const setCps = (cps) => {
    scheduler.setCps(unpure(cps));
    return silence;
  };

  /**
   * Changes the global tempo to the given cycles per minute
   *
   * @name setcpm
   * @alias setCpm
   * @param {number} cpm cycles per minute
   * @example
   * setcpm(140/4) // =140 bpm in 4/4
   * $: s("bd*4,[- sd]*2").bank('tr707')
   */
  const setCpm = (cpm) => {
    scheduler.setCps(unpure(cpm) / 60);
    return silence;
  };

  // TODO - not documented as jsdoc examples as the test framework doesn't simulate enough context for `each` and `all`..

  /** Applies a function to all the running patterns. Note that the patterns are groups together into a single `stack` before the function is applied. This is probably what you want, but see `each` for
   * a version that applies the function to each pattern separately.
   * ```
   * $: sound("bd - cp sd")
   * $: sound("hh*8")
   * all(fast("<2 3>"))
   * ```
   * ```
   * $: sound("bd - cp sd")
   * $: sound("hh*8")
   * all(x => x.pianoroll())
   * ```
   */
  let allTransforms = [];
  const all = function (transform) {
    allTransforms.push(transform);
    return silence;
  };
  /** Applies a function to each of the running patterns separately. This is intended for future use with upcoming 'stepwise' features. See `all` for a version that applies the function to all the patterns stacked together into a single pattern.
   * ```
   * $: sound("bd - cp sd")
   * $: sound("hh*8")
   * each(fast("<2 3>"))
   * ```
   */
  const each = function (transform) {
    eachTransform = transform;
    return silence;
  };

  // set pattern methods that use this repl via closure
  const injectPatternMethods = () => {
    Pattern.prototype.p = function (id) {
      if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) {
        // allows muting a pattern x with x_ or _x
        return silence;
      }
      if (id.includes('$')) {
        // allows adding anonymous patterns with $:
        id = `${id}${anonymousIndex}`;
        anonymousIndex++;
      }
      pPatterns[id] = this;
      return this;
    };
    Pattern.prototype.q = function (id) {
      return silence;
    };
    try {
      for (let i = 1; i < 10; ++i) {
        Object.defineProperty(Pattern.prototype, `d${i}`, {
          get() {
            return this.p(i);
          },
          configurable: true,
        });
        Object.defineProperty(Pattern.prototype, `p${i}`, {
          get() {
            return this.p(i);
          },
          configurable: true,
        });
        Pattern.prototype[`q${i}`] = silence;
      }
    } catch (err) {
      console.warn('injectPatternMethods: error:', err);
    }
    const cpm = register('cpm', function (cpm, pat) {
      return pat._fast(cpm / 60 / scheduler.cps);
    });
    return evalScope({
      all,
      each,
      hush,
      cpm,
      setCps,
      setcps: setCps,
      setCpm,
      setcpm: setCpm,
    });
  };

  const evaluate = async (code, autostart = true, shouldHush = true, blockBased = false, options = {}) => {
    if (!code) {
      throw new Error('no code to evaluate');
    }
    try {
      updateState({ code, pending: true });
      await injectPatternMethods();
      setTime(() => scheduler.now()); // TODO: refactor?
      await beforeEval?.({ code, blockBased });
      allTransforms = []; // reset all transforms

      const transpilerOptionsWithBlock = {
        ...transpilerOptions,
        blockBased,
        range: options.range || [],
      };

      if (!blockBased) {
        codeBlocks = {};
        shouldHush && hush();
      }

      if (mondo) {
        code = `mondolang\`${code}\``;
      }

      let { pattern, meta } = await _evaluate(code, transpiler, transpilerOptionsWithBlock);

      // Track activeVisualizer cleanup: check if any block's visualizer was removed
      let widgetRemoved = false;

      if (blockBased) {
        const labels = extractLabelsFromCode(code);

        // Store code blocks in dictionary using labels as keys
        if (labels.length > 0) {
          for (let i = 0; i < labels.length; i++) {
            // processLabeledBlock(labels, i, code, options, meta);
            // processing transpiler output instead of code is simply to avoid 
            // extra regex in detecting whether or not an inline widget has been commented out
            processLabeledBlock(labels, i, meta.output, options, meta);
          }
        } else if (pattern !== silence) {
          // variable/function declarations that return silence are allowed,
          // but anonymous pattern blocks pose an issue for block-based evaluation
          // if an anonymous pattern is evaluated multiple times it will just stack and get louder and louder

          // it's very common for users to write code prefixed with '$'
          // but to modify and override existing patterns, the patterns must be labeled,
          // otherwise we'll have no idea of which pattern is being overridden

          // (we probably need to update the docs on this)

          // we could easily enable it, but it would confuse a lot of people
          throw new Error(
            'anonymous labels disabled for block based evaluation (see https://strudel.cc/blog/#label-notation)',
          );
        }

        // For block-based evaluation, collect from all blocks
        // The highlight/widget/slider systems will handle selective updates based on the range
        meta.miniLocations = collectFromBlocks('miniLocations');
        meta.widgets = collectFromBlocks('widgets');
        meta.sliders = collectFromBlocks('sliders');

        // Track activeVisualizer cleanup: check if any block's visualizer was removed
        const blocksToUpdate = labels.map((label) => label.name);

        for (const [key, block] of Object.entries(codeBlocks)) {
          if (blocksToUpdate.includes(key)) {
            // This block was just updated
            if (block.activeVisualizer !== null) {
              // Block now has a visualizer, update tracking
              lastActiveVisualizerLabel = key;
            } else if (lastActiveVisualizerLabel === key) {
              // This block lost its visualizer, trigger cleanup
              widgetRemoved = true;
              lastActiveVisualizerLabel = null;
            }
          }
        }
      }

      const allPatterns = Object.values(pPatterns);

      if (blockBased) {
        pPatterns = Object.fromEntries(
          Object.entries(pPatterns).filter(([key]) => {
            return Object.keys(codeBlocks).includes(key);
          }),
        );
      }

      if (allPatterns.length) {
        let patterns = [];
        let soloActive = false;
        for (const [key, value] of Object.entries(pPatterns)) {
          // handle soloed patterns ex: S$: s("bd!4")
          const isSolod = key.length > 1 && key.startsWith('S');
          if (isSolod && soloActive === false) {
            // first time we see a soloed pattern, clear existing patterns
            patterns = [];
            soloActive = true;
          }
          if (!soloActive || (soloActive && isSolod)) {
            const valWithState = value.withState((state) => state.setControls({ id: key }));
            patterns.push(valWithState);
          }
        }
        if (eachTransform) {
          // Explicit lambda so only element (not index and array) are passed
          patterns = patterns.map((x) => eachTransform(x));
        }
        pattern = stack(...patterns);
      } else if (eachTransform) {
        pattern = eachTransform(pattern);
      }
      if (allTransforms.length) {
        for (const transform of allTransforms) {
          pattern = transform(pattern);
        }
      }

      if (!isPattern(pattern)) {
        pattern = silence;
      }

      logger(`[eval] code updated`);
      pattern = await setPattern(pattern, autostart);
      updateState({
        miniLocations: meta?.miniLocations || [],
        widgets: meta?.widgets || [],
        sliders: meta?.sliders || [],
        activeCode: code,
        pattern,
        evalError: undefined,
        schedulerError: undefined,
        pending: false,
      });


      afterEval?.({ code, pattern, meta, range: options.range, widgetRemoved });
      return pattern;
    } catch (err) {
      logger(`[eval] error: ${err.message}`, 'error');
      console.error(err);
      updateState({ evalError: err, pending: false });
      onEvalError?.(err);
    }
  };
  const setCode = (code) => updateState({ code });
  return { scheduler, evaluate, start, stop, pause, setCps, setPattern, setCode, toggle, state };
}

export const getTrigger =
  ({ getTime, defaultOutput }) =>
    async (hap, deadline, duration, cps, t) => {
      //   ^ this signature is different from hap.context.onTrigger, as set by Pattern.onTrigger(onTrigger)
      // TODO: get rid of deadline after https://codeberg.org/uzu/strudel/pulls/1004
      try {
        if (!hap.context.onTrigger || !hap.context.dominantTrigger) {
          await defaultOutput(hap, deadline, duration, cps, t);
        }
        if (hap.context.onTrigger) {
          // call signature of output / onTrigger is different...
          await hap.context.onTrigger(hap, getTime(), cps, t);
        }
      } catch (err) {
        errorLogger(err, 'getTrigger');
      }
    };
