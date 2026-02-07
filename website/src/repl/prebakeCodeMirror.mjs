import { toggleLineComment } from '@codemirror/commands';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { drawSelection, EditorView, keymap } from '@codemirror/view';
import { logger } from '@strudel/core';
import { basicSetup, flash, prebakeField, initTheme, extensions, parseBooleans } from '@strudel/codemirror';

export class PrebakeCodeMirror {
  constructor(initialCode, storePrebake, containerRef, editorRef, settings) {
    this.storePrebake = storePrebake;
    const compartments = Object.fromEntries(Object.keys(extensions).map((key) => [key, new Compartment()]));
    const initialSettings = Object.keys(compartments).map((key) =>
      compartments[key].of(extensions[key](parseBooleans(settings[key]))),
    );
    initTheme(settings.theme);
    let state = EditorState.create({
      doc: initialCode,
      extensions: [
        ...initialSettings,
        basicSetup,
        javascript(),
        javascriptLanguage.data.of({
          closeBrackets: { brackets: ['(', '[', '{', "'", '"', '<'] },
          bracketMatching: { brackets: ['(', '[', '{', "'", '"', '<'] },
        }),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            this.code = v.state.doc.toString();
          }
        }),
        drawSelection({ cursorBlinkRate: 0 }),
        Prec.highest(
          keymap.of([
            {
              mac: 'Meta-Enter',
              run: () => {
                this.savePrebake();
              },
            },
            {
              key: 'Ctrl-Enter',
              run: () => {
                this.savePrebake();
              },
            },
            {
              key: 'Alt-Enter',
              run: () => {
                this.savePrebake();
              },
            },
          ]),
        ),
        prebakeField,
      ],
    });
    editorRef.current = state;
    this.code = initialCode;
    this.view = new EditorView({
      state,
      parent: containerRef.current,
    });
  }

  async savePrebake() {
    flash(this.view);
    this.storePrebake(this.code);
    logger('[prebake] prebake saved');
  }

  toggleComment() {
    try {
      // Honor selections; toggleLineComment handles both selections and
      // single line
      toggleLineComment(this.view);
    } catch (err) {
      console.error('Error handling repl-toggle-comment event', err);
    }
  }

  setCode(code) {
    const changes = {
      from: 0,
      to: this.view.state.doc.length,
      insert: code,
    };
    this.view.dispatch({ changes });
  }
}
