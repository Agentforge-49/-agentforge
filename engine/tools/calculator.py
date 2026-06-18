import ast
import math
import operator


class CalculatorTool:
    def get_definition(self) -> dict:
        return {
            "name": "calculator",
            "description": "Perform mathematical calculations safely.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "The mathematical expression to evaluate"
                    }
                },
                "required": ["expression"]
            }
        }

    def run(self, expression: str) -> str:
        try:
            allowed_functions = {
                'sqrt': math.sqrt, 'abs': abs, 'round': round,
                'log': math.log, 'log10': math.log10,
                'sin': math.sin, 'cos': math.cos, 'tan': math.tan,
                'pi': math.pi, 'e': math.e,
                'min': min, 'max': max, 'pow': pow,
            }
            allowed_operators = {
                ast.Add: operator.add, ast.Sub: operator.sub,
                ast.Mult: operator.mul, ast.Div: operator.truediv,
                ast.Pow: operator.pow, ast.USub: operator.neg,
                ast.UAdd: operator.pos,
            }

            def _eval(node):
                if isinstance(node, ast.Constant):
                    return node.value
                elif isinstance(node, ast.BinOp):
                    op = allowed_operators.get(type(node.op))
                    if op is None:
                        raise ValueError(f"Unsupported operator")
                    return op(_eval(node.left), _eval(node.right))
                elif isinstance(node, ast.UnaryOp):
                    op = allowed_operators.get(type(node.op))
                    if op is None:
                        raise ValueError(f"Unsupported operator")
                    return op(_eval(node.operand))
                elif isinstance(node, ast.Call):
                    func_name = node.func.id if isinstance(node.func, ast.Name) else None
                    if func_name not in allowed_functions:
                        raise ValueError(f"Function '{func_name}' is not allowed")
                    args = [_eval(arg) for arg in node.args]
                    return allowed_functions[func_name](*args)
                else:
                    raise ValueError(f"Unsupported expression type")

            tree   = ast.parse(expression, mode='eval')
            result = _eval(tree.body)

            if isinstance(result, float):
                result = round(result, 10)
                if result.is_integer():
                    result = int(result)
            return f"Result: {result}"

        except ZeroDivisionError:
            return "Error: Division by zero"
        except ValueError as e:
            return f"Error: {str(e)}"
        except SyntaxError:
            return "Error: Invalid syntax in expression"
        except Exception as e:
            return f"Error: {str(e)}"