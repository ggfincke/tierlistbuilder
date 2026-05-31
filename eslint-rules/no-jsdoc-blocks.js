// eslint-rules/no-jsdoc-blocks.js
// prohibits JSDoc blocks (/** ... */) - TypeScript types provide documentation

import { getSourceCode } from './ruleContext.js'

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow JSDoc block comments in favor of single-line comments',
      category: 'Stylistic Issues',
    },
    fixable: null,
    schema: [],
    messages: {
      noJsDoc:
        'JSDoc blocks are not allowed. Use single-line comments (//) instead. TypeScript types provide documentation.',
    },
  },

  create(context)
  {
    const sourceCode = getSourceCode(context)

    return {
      Program()
      {
        const comments = sourceCode.getAllComments()

        for (const comment of comments)
        {
          // check for block comments that start w/ * (JSDoc pattern)
          if (comment.type === 'Block' && comment.value.startsWith('*'))
          {
            context.report({
              loc: comment.loc,
              messageId: 'noJsDoc',
            })
          }
        }
      },
    }
  },
}

export default rule
