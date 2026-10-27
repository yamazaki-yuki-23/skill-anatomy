interface Identifier {
  type: string;
  name?: string;
}
interface BindingNode {
  id?: Identifier | null;
}
interface VariableNode {
  kind: string;
  declarations: BindingNode[];
}
interface RuleContext {
  report(problem: {
    node: Identifier;
    messageId: string;
    data: { name: string; format: string };
  }): void;
}

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
      create(context: RuleContext) {
        function check(node: BindingNode, pattern: RegExp, format: string) {
          const identifier = node.id;
          if (
            identifier?.type === 'Identifier' &&
            typeof identifier.name === 'string' &&
            !pattern.test(identifier.name)
          ) {
            context.report({
              node: identifier,
              messageId: 'invalid',
              data: { name: identifier.name, format },
            });
          }
        }
        return {
          TSInterfaceDeclaration: (node: BindingNode) => check(node, pascalCase, 'PascalCase'),
          TSTypeAliasDeclaration: (node: BindingNode) => check(node, pascalCase, 'PascalCase'),
          ClassDeclaration: (node: BindingNode) => check(node, pascalCase, 'PascalCase'),
          FunctionDeclaration: (node: BindingNode) => check(node, camelCase, 'camelCase'),
          FunctionExpression: (node: BindingNode) => check(node, camelCase, 'camelCase'),
          VariableDeclaration(node: VariableNode) {
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
