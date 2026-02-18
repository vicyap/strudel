/*
helpers.mjs - <short description TODO>
Copyright (C) 2022 Strudel contributors - see <https://codeberg.org/uzu/strudel/src/branch/main/packages/superdough/superdough.mjs>
This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details. You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import escodegen from 'escodegen';
import { walk } from 'estree-walker';

let languages = new Map();
// config = { getLocations: (code: string, offset?: number) => number[][] }
// see mondough.mjs for example use
// the language will kick in when the code contains a template literal of type
// example: mondo`...` will use language of type "mondo"
// TODO: refactor tidal.mjs to use this
export function registerLanguage(type, config) {
  languages.set(type, config);
}
export function getLanguages() {
  return languages;
}

export function withAwait(node) {
  return {
    type: 'AwaitExpression',
    argument: node,
  };
}

export function genExprSource(expr) {
  return escodegen.generate(expr, { format: { semicolons: false } });
}

export function extractPatternPlaceholders(expr) {
  const templateExpr = cloneNode(expr);
  const parents = new Map();
  const targets = [];

  walk(templateExpr, {
    enter(node, parent, prop, index) {
      parents.set(node, { parent, prop, index });
      const patternExpr = getStrudelPatternExpr(node);
      if (patternExpr) {
        targets.push({ node, patternExpr });
        this.skip();
      }
    },
  });

  if (!targets.length) {
    return { template: genExprSource(templateExpr), patternExprs: [] };
  }

  targets.sort((a, b) => getPatternNodeOrder(a.node) - getPatternNodeOrder(b.node));

  const patternExprs = targets.map(({ patternExpr }) => cloneNode(patternExpr));

  let currentExpr = templateExpr;
  targets.forEach(({ node }, index) => {
    currentExpr = replaceNode(node, placeholderAst(index), parents, currentExpr);
  });

  const template = genExprSource(currentExpr);
  return { template, patternExprs };
}

function getStrudelPatternExpr(node) {
  if (isStrudelPatternWrap(node)) {
    const arg = node.arguments?.[0];
    if (!arg) {
      throw new Error('S(...) requires an argument');
    }
    return arg;
  }
  if (isMiniCall(node)) {
    return node;
  }
  return null;
}

function isStrudelPatternWrap(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return callee.name === 'S';
  }
  if (callee.type === 'MemberExpression' && !callee.computed) {
    return callee.property?.name === 'S';
  }
  return false;
}

// If `start` is available, we use it. If it's already been transpiled
// to `m(...)`, use the provided offset
function getPatternNodeOrder(node) {
  if (typeof node.start === 'number') {
    return node.start;
  }
  if (isMiniCall(node)) {
    const offsetArg = node.arguments?.[1];
    if (offsetArg?.type === 'Literal' && typeof offsetArg.value === 'number') {
      return offsetArg.value;
    }
  }
  return 0;
}

function placeholderAst(index) {
  return {
    type: 'MemberExpression',
    object: { type: 'Identifier', name: 'pat' },
    property: { type: 'Literal', value: index },
    computed: true,
    optional: false,
  };
}

// Used to identify transpiled `m(...)` calls for proper conversion
// to, say, kabelsalat placeholders
function isMiniCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = node.callee;
  if (callee.type !== 'Identifier') {
    return false;
  }
  if (callee.name !== getMinilangName()) {
    return false;
  }
  const firstArg = node.arguments?.[0];
  return firstArg?.type === 'Literal' && typeof firstArg.value === 'string';
}

function getMinilangName() {
  const minilang = getLanguages().get('minilang');
  return minilang?.name || 'm';
}

function replaceNode(node, replacement, parents, currentRoot) {
  const info = parents.get(node);
  if (!info || !info.parent) {
    return replacement;
  }

  const { parent, prop, index } = info;
  if (Array.isArray(parent[prop])) {
    parent[prop][index] = replacement;
  } else {
    parent[prop] = replacement;
  }
  parents.set(replacement, { parent, prop, index });
  return currentRoot;
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}
