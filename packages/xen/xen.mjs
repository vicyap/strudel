/*
xen.mjs - <short description TODO>
Copyright (C) 2022 Strudel contributors - see <https://codeberg.org/uzu/strudel/src/branch/main/packages/xen/xen.mjs>
This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details. You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { register, _mod, parseNumeral } from '@strudel/core';
import Tune from './tunejs.js';

// returns a list of frequency ratios for given edo scale
export function edo(name) {
  if (!/^[1-9]+[0-9]*edo$/.test(name)) {
    throw new Error('not an edo scale: "' + name + '"');
  }
  const [_, divisions] = name.match(/^([1-9]+[0-9]*)edo$/);
  return Array.from({ length: divisions }, (_, i) => Math.pow(2, i / divisions));
}

const presets = {
  '12ji': [1 / 1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 16 / 9, 15 / 8],
};

// Given a base frequency such as 220 and an edo scale, returns
// an array of frequencies representing the given edo scale in that base
function withBase(freq, scale) {
  return scale.map((r) => r * freq);
}

const defaultBase = 220;

// Assumes a base of 220. Returns a filtered scale based on 'indices'
// NOTE: indices functionality is unused
function getXenScale(scale, indices) {
  let tune = new Tune();
  if (typeof scale === 'string') {
    if (/^[1-9]+[0-9]*edo$/.test(scale)) {
      scale = edo(scale);
    } else if (presets[scale]) {
      scale = presets[scale];
    } else if (tune.isValidScale(scale)) {
      tune.loadScale(scale);
      scale = tune.scale;
    } else {
      throw new Error('unknown scale name: "' + scale + '"');
    }
  }
  scale = withBase(defaultBase, scale);
  if (!indices) {
    return scale;
  }
  return scale.filter((_, i) => indices.includes(i));
}

function xenOffset(xenScale, offset, index = 0) {
  const i = _mod(index + offset, xenScale.length);
  const oct = Math.floor(offset / xenScale.length);
  return xenScale[i] * Math.pow(2, oct);
}

// accepts a scale name such as 31edo, and a pattern
// pattern expected to follow format such that a value can be mapped
// to an edostep within the scale. Returns the pattern with
// values mapped to the frequencies associated with the given edosteps
// scaleNameOrRatios: string || number[], steps?: number

/**
 * Assumes a numerical pattern of scale steps, and a scale. Scales accepted are all preset scale names of `tune`, arbitrary edos such as 31edo, or an array of frequency ratios. Assumes scales repeat at octave (2/1). Returns a new pattern with all values mapped to their associated frequency, assuming a base frequency of 220hz.
 *
 * @name xen
 * @returns Pattern
 * @memberof Pattern
 * @param {(string | number[] )} scaleNameOrRatios
 * @tags tonal
 * @example
 * // A major triad in 31edo:
 * "0 8 18".xen("31edo").freq().piano()
 * @example
 * // You can also use xen with frequency ratios.
 * // This is equivalent to the above:
 * "0 1 2".xen([
 *   Math.pow(2, 0/31),
 *   Math.pow(2, 8/31),
 *   Math.pow(2, 18/31),
 * ]).freq().piano()
 * @example
 * // xen also supports all scale names that
 * // tune does:
 * "0 1 2 3 4 5".xen("hexany15").freq()
 * // equiv to:
 * // "0 1 2 3 4 5".tune("hexany15").mul("220").freq()
 */

// TODO feat: change root frequency
// TODO add explanation for what "31edo" etc. are
// TODO (maybe): should this return freq ratios like tune does, for parity's sake?
export const xen = register('xen', function (scaleNameOrRatios, pat) {
  return pat.withHap((hap) => {
    const scale = getXenScale(scaleNameOrRatios);
    let frequency = xenOffset(scale, parseNumeral(hap.value));
    // 10 is somewhat arbitrary
    frequency = parseFloat(frequency.toPrecision(10));
    return hap.withValue(() => frequency);
  });
});

// not sure there's a point to having this and the above, seems like a proto version of the above.
export const tuning = register('tuning', function (ratios, pat) {
  return pat.withHap((hap) => {
    const frequency = xenOffset(ratios, parseNumeral(hap.value));
    return hap.withValue(() => frequency);
  });
});
