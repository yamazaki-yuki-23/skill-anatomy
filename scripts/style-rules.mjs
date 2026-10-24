const camelCase = /^[a-z][a-zA-Z0-9]*$/;
const pascalCase = /^[A-Z][a-zA-Z0-9]*$/;
const constantCase = /^([a-z][a-zA-Z0-9]*|[A-Z][A-Z0-9_]*)$/;

export default {
  meta: { name: 'style' },
  rules: {
    naming: {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: { invalid: '{{name}} must use {{format}}.' },
      },
      create(context) {
        function check(node, pattern, format) {
          const identifier = node.id;
          if (identifier?.type === 'Identifier' && !pattern.test(identifier.name)) {
            context.report({
              node: identifier,
              messageId: 'invalid',
              data: { name: identifier.name, format },
            });
          }
        }
        return {
          TSInterfaceDeclaration: (node) => check(node, pascalCase, 'PascalCase'),
          TSTypeAliasDeclaration: (node) => check(node, pascalCase, 'PascalCase'),
          ClassDeclaration: (node) => check(node, pascalCase, 'PascalCase'),
          FunctionDeclaration: (node) => check(node, camelCase, 'camelCase'),
          FunctionExpression: (node) => check(node, camelCase, 'camelCase'),
          VariableDeclaration(node) {
            for (const declaration of node.declarations) {
              check(
                declaration,
                node.kind === 'const' ? constantCase : camelCase,
                node.kind === 'const' ? 'camelCase or UPPER_SNAKE_CASE' : 'camelCase',
              );
            }
          },
        };
      },
    },
  },
};
