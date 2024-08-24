function refactor(ast) {
    const transformedAst = JSON.parse(JSON.stringify(ast));

    function processNode(node) {
        if (!node) return null;
        let newNodes = null;
        
        // 複数の式を個別の文に分割し、processNodeを呼び出す
        if (node.type === "ExpressionStatement" && node.expression.type === "SequenceExpression") {
            newNodes = node.expression.expressions.flatMap(expr => {
                const exprStatement = {
                    type: "ExpressionStatement",
                    expression: expr,
                };
                return processNode(exprStatement); // 各式に対してprocessNodeを呼び出す
            });
        }

        // 変数宣言の処理
        if (node.type === "VariableDeclaration") {
            newNodes = node.declarations.map(declaration => ({
                type: "VariableDeclaration",
                declarations: [declaration],
                kind: node.kind,
            }));
        }

        // 条件 && (c) の処理
        if (node.type === "ExpressionStatement" && node.expression.type === "LogicalExpression") {
            const test = node.expression.left;
            const consequent = {
                type: "BlockStatement",
                body: [{
                    type: "ExpressionStatement",
                    expression: node.expression.right,
                }],
            };

            if (node.expression.operator === "&&") {
                newNodes = processNode({
                    type: "IfStatement",
                    test: test,
                    consequent: consequent,
                    alternate: null,
                });
            } else if (node.expression.operator === "||") {
                newNodes = processNode({
                    type: "IfStatement",
                    test: {
                        type: "UnaryExpression",
                        operator: "!",
                        argument: test,
                        prefix: true,
                    },
                    consequent: consequent,
                    alternate: null,
                });
            }
        }

        // 関数の処理
        if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
            node.body = processNode(node.body)[0];
        }

        // 代入式の処理
        if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
            if (node.expression.right.type === "FunctionExpression") {
                node.expression.right.body = processNode(node.expression.right.body)[0];
            }else if(node.expression.right.type === "ConditionalExpression"){
                const { left, right } = node.expression;
                const { test, consequent, alternate } = right;
                newNodes = processNode({
                    type: "IfStatement",
                    test: test,
                    consequent: {
                        type: "BlockStatement",
                        body: [{
                            type: "ExpressionStatement",
                            expression: {
                                type: "AssignmentExpression",
                                operator: "=",
                                left: left,
                                right: consequent,
                            },
                        }],
                    },
                    alternate: {
                        type: "BlockStatement",
                        body: [{
                            type: "ExpressionStatement",
                            expression: {
                                type: "AssignmentExpression",
                                operator: "=",
                                left: left,
                                right: alternate,
                            },
                        }],
                    },
                });
            }
        }

        // 三項演算子の処理
        if (node.type === "ExpressionStatement" && node.expression.type === "ConditionalExpression") {
            const { test, consequent, alternate } = node.expression;

            newNodes=processNode( {
                type: "IfStatement",
                test: test,
                consequent: {
                    type: "BlockStatement",
                    body: [{
                        type: "ExpressionStatement",
                        expression: consequent,
                    }],
                },
                alternate: {
                    type: "BlockStatement",
                    body: [{
                        type: "ExpressionStatement",
                        expression: alternate,
                    }],
                },
            });
        }
        
        // if文の処理
        if (node.type === "IfStatement") {
            if (node.consequent.type !== "BlockStatement") {
                node.consequent = {
                    type: "BlockStatement",
                    body: [node.consequent],
                };
            }
            node.consequent=processNode(node.consequent)[0];
            if (node.alternate) {
                if (node.alternate.type !== "BlockStatement") {
                    node.alternate = {
                        type: "BlockStatement",
                        body: [node.alternate],
                    };
                }
                node.alternate=processNode(node.alternate)[0];
                if(node.alternate.type === "BlockStatement" && node.alternate.body.length === 1) {
                    if(node.alternate.body[0].type === "IfStatement") {
                        node.alternate = node.alternate.body[0];
                    }
                }
            }
            
            newNodes = [node];
            // 条件がSequenceExpressionの場合
            if (node.test.type === "SequenceExpression") {
                const expressions = node.test.expressions;
                const lastExpression = expressions.pop();

                const statements = expressions.flatMap(expr => {
                    const exprStatement = {
                        type: "ExpressionStatement",
                        expression: expr,
                    };
                    return processNode(exprStatement);
                });

                node.test = lastExpression;

                newNodes = [
                    ...statements,
                    node,
                ];
            }
            
            if (node.test.type === "LogicalExpression" && node.test.right.type === "SequenceExpression") {
                const rightExpressions = node.test.right.expressions;
                const lastRightExpression = rightExpressions.pop();

                const rightStatements = rightExpressions.flatMap(expr => {
                    const exprStatement = {
                        type: "ExpressionStatement",
                        expression: expr,
                    };
                    return processNode(exprStatement);
                });

                const newIfStatement = {
                    type: "IfStatement",
                    test: node.test.left,
                    consequent: {
                        type: "BlockStatement",
                        body: [
                            ...rightStatements,
                            {
                                type: "IfStatement",
                                test: lastRightExpression,
                                consequent: node.consequent,
                                alternate: node.alternate,
                            },
                        ].flatMap(node => processNode(node)),
                    },
                    alternate: node.alternate,
                };

                newNodes[newNodes.length - 1] = newIfStatement;
            }
        }

        // for文の処理
        if (node.type === "ForStatement") {
            if (node.body.type !== "BlockStatement") {
                node.body = {
                    type: "BlockStatement",
                    body: [node.body],
                };
            }
            node.body= processNode(node.body)[0];
            // 条件がSequenceExpressionの場合
            if (node.init && node.init.type === "SequenceExpression") {
                const expressions = node.init.expressions;
                const lastExpression = expressions.pop();
        
                const statements = expressions.flatMap(expr => {
                    const exprStatement = {
                        type: "ExpressionStatement",
                        expression: expr,
                    };
                    return processNode(exprStatement);
                });
        
                node.init = lastExpression;
        
                newNodes = [
                    ...statements,
                    node,
                ];
            }
            

        }
            

        // while文の処理
        if (node.type === "WhileStatement") {
            if (node.body.type !== "BlockStatement") {
                node.body = {
                    type: "BlockStatement",
                    body: [node.body],
                };
            }
            node.body= processNode(node.body)[0];
        }

        // switch文の処理
        if (node.type === "SwitchStatement") {
            node.cases = node.cases.map(caseNode => {
                caseNode.consequent = caseNode.consequent.flatMap(stmt => processNode(stmt));
                return caseNode;
            });
        }

        // TryStatementの処理
        if (node.type === "TryStatement") {
            node.block = processNode(node.block)[0]; // tryブロックを処理
            if (node.handler) {
                node.handler.body = processNode(node.handler.body)[0]; // catchブロックを処理
            }
            if (node.finalizer) {
                node.finalizer = processNode(node.finalizer)[0]; // finallyブロックを処理
            }
        }
        
        if (node.type === "BlockStatement") {
            node.body = node.body.flatMap(childNode => processNode(childNode));
        }

        if(newNodes===null){
            newNodes = [node];
        }
        return newNodes;
    }

    transformedAst.body = transformedAst.body.flatMap(node => processNode(node));

    return transformedAst;
}

function format(code) {
    const ast = acorn.parse(code, {
        ecmaVersion: 2020
    })
    const formatted = refactor(ast)
    let formattedCode = astring.generate(formatted, {
        indent: '    ', // インデントの設定
        newline: '\n'    // 改行の設定
    })
    let lines=formattedCode.split("\n")
    for(let i=0;i<lines.length;i++) {
        if(lines[i].includes("], [")) {
            let match = lines[i].match(/\[(\[+)/);
            if (match) {
                let leftBracketIndex = match.index + match[0].length-1;
                let spaces = ' '.repeat(leftBracketIndex);
                lines[i]=lines[i].replaceAll("], [", "],\n" + spaces + "[").replaceAll("  [["," [[");
            }
        }
    }
    formattedCode=lines.join("\n")
    //return formattedCode
    return formattedCode+"\n"//+JSON.stringify(formatted, null, 2)
}

document.getElementById("sr_format").addEventListener("click", function () {
    document.getElementById("sr_output").textContent = "//formatting...\n"
    setTimeout(function () {
        const code = document.getElementById("sr_input").value
        const formatted = format(code)
        document.getElementById("sr_output").textContent = formatted
    },100)
})

document.getElementById("sr_copy").addEventListener("click", function () {
    const code = document.getElementById("sr_output").textContent
    navigator.clipboard.writeText(code)
})

document.getElementById("sr_change").addEventListener("click", function () {
    const code = document.getElementById("sr_output").textContent
    document.getElementById("sr_output").textContent = code.replace("location.hostname;",'"dan-ball.jp";//location.hostname;')
})
