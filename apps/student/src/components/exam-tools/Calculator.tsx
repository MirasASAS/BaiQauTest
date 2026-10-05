import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@baiqautest/shared';

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ') {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
    } else if ('+-×÷√²%()'.includes(ch)) {
      tokens.push(ch);
      i++;
    } else {
      throw new Error('Invalid character');
    }
  }
  return tokens;
}

class ExpressionParser {
  private pos = 0;

  constructor(private readonly tokens: string[]) {}

  parse(): number {
    const value = this.parseExpr();
    if (this.pos < this.tokens.length) throw new Error('Trailing tokens');
    return value;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const op = this.tokens[this.pos];
      if (op === '+' || op === '-') {
        this.pos++;
        const rhs = this.parseTerm();
        value = op === '+' ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      const op = this.tokens[this.pos];
      if (op === '×' || op === '÷') {
        this.pos++;
        const rhs = this.parseFactor();
        if (op === '÷') {
          if (rhs === 0) throw new Error('Division by zero');
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      } else {
        return value;
      }
    }
  }

  private parseFactor(): number {
    const tok = this.tokens[this.pos];
    if (tok === '-') {
      this.pos++;
      return -this.parseFactor();
    }
    if (tok === '+') {
      this.pos++;
      return this.parseFactor();
    }
    if (tok === '√') {
      this.pos++;
      const value = this.parseFactor();
      if (value < 0) throw new Error('Square root of negative number');
      return Math.sqrt(value);
    }
    return this.parsePostfix();
  }

  private parsePostfix(): number {
    let value = this.parsePrimary();
    for (;;) {
      const tok = this.tokens[this.pos];
      if (tok === '²') {
        value = value * value;
        this.pos++;
      } else if (tok === '%') {
        value = value / 100;
        this.pos++;
      } else {
        return value;
      }
    }
  }

  private parsePrimary(): number {
    const tok = this.tokens[this.pos];
    if (tok === undefined) throw new Error('Unexpected end of expression');
    if (tok === '(') {
      this.pos++;
      const value = this.parseExpr();
      if (this.tokens[this.pos] !== ')') throw new Error('Missing closing parenthesis');
      this.pos++;
      return value;
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(tok)) {
      this.pos++;
      return parseFloat(tok);
    }
    throw new Error('Unexpected token');
  }
}

const baseButton =
  'flex items-center justify-center py-3 text-lg font-medium rounded-xl transition-colors select-none cursor-pointer';
const digitButton = `${baseButton} bg-white border border-gray-200 text-gray-900 hover:bg-gray-50`;
const operatorButton = `${baseButton} bg-blue-50 text-[#2563eb] hover:bg-blue-100`;
const utilityButton = `${baseButton} bg-gray-100 text-gray-700 hover:bg-gray-200`;

export function Calculator({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  function append(token: string) {
    if (hasError) {
      setExpression(token);
      setHasError(false);
    } else if (result !== null && /^[0-9.]$/.test(token)) {
      setExpression(token);
    } else {
      setExpression(prev => prev + token);
    }
    setResult(null);
  }

  function backspace() {
    if (hasError || result !== null) {
      setExpression('');
      setHasError(false);
      setResult(null);
      return;
    }
    setExpression(prev => prev.slice(0, -1));
  }

  function clear() {
    setExpression('');
    setResult(null);
    setHasError(false);
  }

  function calculate() {
    if (!expression) return;
    try {
      const value = new ExpressionParser(tokenize(expression)).parse();
      if (!isFinite(value)) throw new Error('Result is not finite');
      const rounded = Math.round(value * 1e12) / 1e12;
      const text = String(rounded);
      setResult(text);
      setExpression(text);
      setHasError(false);
    } catch {
      setHasError(true);
      setResult(null);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (/^[0-9]$/.test(e.key)) append(e.key);
      else if (e.key === '.') append('.');
      else if (e.key === '+') append('+');
      else if (e.key === '-') append('-');
      else if (e.key === '*') append('×');
      else if (e.key === '/') {
        e.preventDefault();
        append('÷');
      } else if (e.key === '(') append('(');
      else if (e.key === ')') append(')');
      else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculate();
      } else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') clear();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">{t('toolCalculator')}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <div className="mb-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl min-h-[3.25rem] flex items-center justify-end overflow-x-auto">
            <span className="text-2xl font-medium text-gray-900 whitespace-nowrap">
              {hasError ? t('error') : (result ?? expression) || '0'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={clear} className={`${baseButton} bg-red-100 text-red-600 hover:bg-red-200`}>C</button>
            <button type="button" onClick={backspace} className={utilityButton}>←</button>
            <button type="button" onClick={() => append('%')} className={operatorButton}>%</button>
            <button type="button" onClick={() => append('÷')} className={operatorButton}>÷</button>

            <button type="button" onClick={() => append('√')} className={operatorButton}>√</button>
            <button type="button" onClick={() => append('²')} className={operatorButton}>x²</button>
            <button type="button" onClick={() => append('(')} className={utilityButton}>(</button>
            <button type="button" onClick={() => append(')')} className={utilityButton}>)</button>

            <button type="button" onClick={() => append('7')} className={digitButton}>7</button>
            <button type="button" onClick={() => append('8')} className={digitButton}>8</button>
            <button type="button" onClick={() => append('9')} className={digitButton}>9</button>
            <button type="button" onClick={() => append('×')} className={operatorButton}>×</button>

            <button type="button" onClick={() => append('4')} className={digitButton}>4</button>
            <button type="button" onClick={() => append('5')} className={digitButton}>5</button>
            <button type="button" onClick={() => append('6')} className={digitButton}>6</button>
            <button type="button" onClick={() => append('-')} className={operatorButton}>−</button>

            <button type="button" onClick={() => append('1')} className={digitButton}>1</button>
            <button type="button" onClick={() => append('2')} className={digitButton}>2</button>
            <button type="button" onClick={() => append('3')} className={digitButton}>3</button>
            <button type="button" onClick={() => append('+')} className={operatorButton}>+</button>

            <button type="button" onClick={() => append('.')} className={digitButton}>.</button>
            <button type="button" onClick={() => append('0')} className={digitButton}>0</button>
            <button type="button" onClick={calculate} className={`${baseButton} col-span-2 bg-[#2563eb] text-white hover:bg-[#1e3a8a]`}>=</button>
          </div>
        </div>
      </div>
    </div>
  );
}
