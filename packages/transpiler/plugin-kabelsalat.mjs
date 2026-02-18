/*
plugin-kabelsalat.mjs - <short description TODO>
Copyright (C) 2022 Strudel contributors - see <https://codeberg.org/uzu/strudel/src/branch/main/packages/superdough/superdough.mjs>
This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details. You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { genExprSource, extractPatternPlaceholders } from './helpers.mjs';

export const transpilerPlugin = {
  walk: (context) => ({
    leave: function (node, parent, prop, index) {
      if (!isKabelCall(node)) return;
      let [expr, ...rest] = node.arguments;
      if (!expr) throw new Error('K(...) requires an expression');
      if (shouldCallKabelExpression(expr)) {
        expr = {
          type: 'CallExpression',
          callee: expr,
          arguments: [],
          optional: false,
        };
      }
      const language = 'kabelsalat';
      const { template, patternExprs } = extractPatternPlaceholders(expr);
      if (patternExprs.length) {
        const workletArgs = [
          /*{ type: 'Literal', value: language },*/
          { type: 'Literal', value: template },
          ...patternExprs,
          ...rest,
        ];
        let callee = node.callee;
        if (callee.type === 'ChainExpression') callee = callee.expression;
        if (callee.type === 'MemberExpression') {
          return this.replace({
            type: 'CallExpression',
            callee: workletMemberAst(callee.object),
            arguments: workletArgs,
            optional: false,
          });
        }
        return this.replace({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'worklet' },
          arguments: workletArgs,
          optional: false,
        });
      }

      const kabelSrc = genExprSource(expr);
      const workletArgs = [/*{ type: 'Literal', value: language },*/ { type: 'Literal', value: kabelSrc }, ...rest];

      let callee = node.callee;
      if (callee.type === 'ChainExpression') callee = callee.expression;
      if (callee.type === 'MemberExpression') {
        return this.replace({
          type: 'CallExpression',
          callee: workletMemberAst(callee.object),
          arguments: workletArgs,
          optional: false,
        });
      }
      return this.replace({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'worklet' },
        arguments: workletArgs,
        optional: false,
      });
    },
  }),
};

function isKabelCall(node) {
  if (node.type !== 'CallExpression') return false;
  let callee = node.callee;
  if (callee.type === 'ChainExpression') callee = callee.expression;
  if (callee.type === 'MemberExpression') return !callee.computed && callee.property?.name === 'K';
  return callee.type === 'Identifier' && callee.name === 'K';
}

function shouldCallKabelExpression(expr) {
  if (expr.type !== 'ArrowFunctionExpression' && expr.type !== 'FunctionExpression') {
    return false;
  }
  if (expr.params.length) {
    return false;
  }
  return expr.body?.type === 'BlockStatement';
}

function workletMemberAst(objectExpr) {
  return {
    type: 'MemberExpression',
    object: objectExpr,
    property: { type: 'Identifier', name: 'worklet' },
    computed: false,
    optional: false,
  };
}
