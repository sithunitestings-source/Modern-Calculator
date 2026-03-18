 (function () {
            'use strict';

            // ----- DOM elements -----
            const currentDisplay = document.getElementById('current-display');
            const historyDisplay = document.getElementById('history-display');
            const announcer = document.getElementById('live-announcer');
            const themeToggle = document.getElementById('theme-toggle');
            const themeToggleIcon = themeToggle?.querySelector('.theme-toggle-icon');
            const themeToggleText = themeToggle?.querySelector('.theme-toggle-text');

            // Buttons (for potential direct event attachment, but we'll use delegation)
            const buttonsContainer = document.querySelector('.buttons');
            const themeStorageKey = 'calculator-theme';

            // ----- Calculator state -----
            let currentOperand = '0';
            let previousOperand = '';
            let operation = undefined;        // '÷', '×', '−', '+', '%' (stored as symbol)
            let shouldResetScreen = false;    // flag to start new operand after operator or equals
            let lastResult = null;            // optional, but used for consecutive equals

            function applyTheme(theme) {
                const isLightMode = theme === 'light';
                document.body.classList.toggle('light-mode', isLightMode);

                if (themeToggle) {
                    themeToggle.setAttribute('aria-pressed', String(isLightMode));
                    themeToggle.setAttribute('aria-label', isLightMode ? 'Switch to dark mode' : 'Switch to light mode');
                }

                if (themeToggleIcon) {
                    themeToggleIcon.textContent = isLightMode ? '☾' : '☀';
                }

                if (themeToggleText) {
                    themeToggleText.textContent = isLightMode ? 'Dark' : 'Light';
                }
            }

            function getInitialTheme() {
                const savedTheme = localStorage.getItem(themeStorageKey);
                if (savedTheme === 'light' || savedTheme === 'dark') {
                    return savedTheme;
                }

                return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
            }

            function toggleTheme() {
                const nextTheme = document.body.classList.contains('light-mode') ? 'dark' : 'light';
                applyTheme(nextTheme);
                localStorage.setItem(themeStorageKey, nextTheme);
                announcer.textContent = `${nextTheme} mode`;
            }

            // ----- helper functions -----
            function formatNumber(value) {
                // avoid scientific notation, limit decimal length
                if (value === '') return '0';
                // convert to string, handle large numbers
                let num = parseFloat(value);
                if (isNaN(num)) return '0';
                // if integer, show without trailing .0
                if (Number.isInteger(num)) return num.toString();
                // for floats: limit to 8 decimal places but trim trailing zeros
                let str = num.toFixed(8).replace(/\.?0+$/, '');
                return str;
            }

            function updateDisplay() {
                // show current operand (always)
                currentDisplay.textContent = currentOperand === '' ? '0' : currentOperand;

                // build history: previous operand + operation if exists
                if (operation && previousOperand) {
                    let opSymbol = operation;
                    // use nicer symbols
                    if (opSymbol === '/') opSymbol = '÷';
                    if (opSymbol === '*') opSymbol = '×';
                    if (opSymbol === '-') opSymbol = '−';
                    if (opSymbol === '+') opSymbol = '+';
                    historyDisplay.textContent = `${previousOperand} ${opSymbol}`;
                } else if (previousOperand && !operation) {
                    // after equals, sometimes we want to show just previous
                    historyDisplay.textContent = previousOperand;
                } else {
                    historyDisplay.textContent = '';
                }
            }

            // append number/digit
            function appendNumber(number) {
                if (shouldResetScreen) {
                    currentOperand = '';
                    shouldResetScreen = false;
                }
                // avoid multiple leading zeros (but allow single zero)
                if (number === '0' && currentOperand === '0') return;
                if (number !== '0' && currentOperand === '0') {
                    currentOperand = number;  // replace leading zero
                } else {
                    // limit length to avoid overflow (max 12 digits)
                    if (currentOperand.replace(/[.-]/g, '').length >= 12) return;
                    currentOperand += number;
                }
                updateDisplay();
            }

            // decimal point
            function appendDecimal() {
                if (shouldResetScreen) {
                    currentOperand = '0';
                    shouldResetScreen = false;
                }
                // if already has a dot, ignore
                if (currentOperand.includes('.')) return;
                // if empty or just '0' after reset, prepend 0.
                if (currentOperand === '' || currentOperand === '-') {
                    currentOperand = '0.';
                } else {
                    currentOperand += '.';
                }
                updateDisplay();
            }

            // clear everything
            function clearAll() {
                currentOperand = '0';
                previousOperand = '';
                operation = undefined;
                shouldResetScreen = false;
                lastResult = null;
                updateDisplay();
            }

            // delete last character
            function deleteLast() {
                if (shouldResetScreen || currentOperand === '0') return; // nothing to delete effectively
                if (currentOperand.length > 1) {
                    currentOperand = currentOperand.slice(0, -1);
                } else {
                    currentOperand = '0';
                }
                updateDisplay();
            }

            // percent: transform current operand to percentage of previous or itself
            function handlePercent() {
                if (currentOperand === '0' && !previousOperand) {
                    currentOperand = '0';
                    updateDisplay();
                    return;
                }

                let curr = parseFloat(currentOperand);
                if (isNaN(curr)) curr = 0;

                // if there's previous and an operation pending, treat as percent of previous
                if (previousOperand && operation) {
                    let prev = parseFloat(previousOperand);
                    if (isNaN(prev)) prev = 0;
                    // percentage relative to previous: (prev * curr / 100)
                    let result = (prev * curr) / 100;
                    currentOperand = formatNumber(result.toString());
                } else {
                    // just convert current to hundredths
                    currentOperand = formatNumber((curr / 100).toString());
                }
                // typically after percent we want to continue building, but no reset
                shouldResetScreen = false;
                updateDisplay();
            }

            // choose operation (stored internally as /, *, -, + for evaluate)
            function chooseOperation(op) {
                // map visual symbol to internal arithmetic
                let internalOp;
                if (op === '÷') internalOp = '/';
                else if (op === '×') internalOp = '*';
                else if (op === '−') internalOp = '-';
                else if (op === '+') internalOp = '+';
                else if (op === '%') {  // special immediate
                    handlePercent();
                    return;
                } else {
                    internalOp = op; // fallback
                }

                // if there's already a pending operation, compute it first (except if current is empty)
                if (operation && previousOperand && !shouldResetScreen) {
                    evaluate();
                }

                // after possible evaluate, set new operation
                operation = internalOp;  // store as '/', '*', '-', '+'
                // if current operand is empty after evaluate, keep previous
                if (currentOperand === '' || currentOperand === '0') {
                    // do nothing, keep previous as is
                } else {
                    previousOperand = currentOperand;
                }
                currentOperand = '0';
                shouldResetScreen = false;
                updateDisplay();
            }

            // evaluate the expression
            function evaluate() {
                if (!operation || previousOperand === '' || previousOperand === undefined) {
                    // if no operation, just return current
                    return;
                }

                let prev = parseFloat(previousOperand);
                let curr = parseFloat(currentOperand);
                if (isNaN(prev) || isNaN(curr)) {
                    // reset on error
                    clearAll();
                    return;
                }

                let computation;
                switch (operation) {
                    case '+':
                        computation = prev + curr;
                        break;
                    case '-':
                        computation = prev - curr;
                        break;
                    case '*':
                        computation = prev * curr;
                        break;
                    case '/':
                        if (curr === 0) {
                            // division by zero – friendly message
                            currentOperand = '∞';
                            previousOperand = '';
                            operation = undefined;
                            shouldResetScreen = true;
                            updateDisplay();
                            announcer.textContent = 'Error: division by zero';
                            return;
                        }
                        computation = prev / curr;
                        break;
                    default:
                        return;
                }

                // store result as current, formatted
                currentOperand = formatNumber(computation.toString());
                previousOperand = '';        // after equals, history clears but we will show old history later
                operation = undefined;
                shouldResetScreen = true;    // next digit will overwrite

                // update history line with the completed expression
                let opSymbol = operation; // but operation cleared, keep copy?
                // we manually set history to previous expression before reset
                let opChar = (operation === '/' ? '÷' : (operation === '*' ? '×' : (operation === '-' ? '−' : (operation === '+' ? '+' : ''))));
                // but operation is undefined, so we need to temporarily save
                // simpler: after computation we show just result, history is blank. fine.
                updateDisplay();
                // store last result for consecutive equals
                lastResult = parseFloat(currentOperand);
            }

            // handle equals key
            function handleEquals() {
                if (operation && previousOperand) {
                    evaluate();
                } else if (!operation && previousOperand && currentOperand && lastResult !== null) {
                    // consecutive equals: reuse last operation? we keep simpler: just treat as no-op
                    // better: do nothing special
                } else {
                    // nothing to evaluate
                }
                // after equals, history can show previous operand + operation? but we cleared, fine.
            }

            // ----- event listener (delegation) -----
            buttonsContainer.addEventListener('click', (e) => {
                const target = e.target;
                if (!target.classList.contains('btn')) return;

                // number buttons: text content is digit
                if (target.id.startsWith('num') || target.id === 'num0') {
                    const digit = target.textContent; // '0'..'9'
                    appendNumber(digit);
                    announcer.textContent = `digit ${digit}`;
                    return;
                }

                // decimal
                if (target.id === 'decimal') {
                    appendDecimal();
                    announcer.textContent = 'decimal point';
                    return;
                }

                // clear
                if (target.id === 'clear') {
                    clearAll();
                    announcer.textContent = 'all clear';
                    return;
                }

                // delete
                if (target.id === 'delete') {
                    deleteLast();
                    announcer.textContent = 'delete';
                    return;
                }

                // operator buttons: add, subtract, multiply, divide, percent
                if (target.classList.contains('operator')) {
                    const op = target.textContent; // '÷', '×', '−', '+', '%'
                    chooseOperation(op);
                    announcer.textContent = `operator ${op}`;
                    return;
                }

                // equals
                if (target.id === 'equals') {
                    handleEquals();
                    announcer.textContent = 'equals';
                    return;
                }

                // fallback for any other (should not happen)
            });

            themeToggle?.addEventListener('click', () => {
                toggleTheme();
            });

            // keyboard support
            window.addEventListener('keydown', (e) => {
                const key = e.key;
                // prevent default scrolling for keys
                if (/^[0-9]$/.test(key)) {
                    appendNumber(key);
                    announcer.textContent = `digit ${key}`;
                    e.preventDefault();
                } else if (key === '.') {
                    appendDecimal();
                    announcer.textContent = 'decimal';
                    e.preventDefault();
                } else if (key === 'Backspace') {
                    deleteLast();
                    announcer.textContent = 'backspace';
                    e.preventDefault();
                } else if (key === 'Escape' || key === 'Delete' || key === 'c' || key === 'C') {
                    clearAll();
                    announcer.textContent = 'clear';
                    e.preventDefault();
                } else if (key === '%') {
                    handlePercent();
                    announcer.textContent = 'percent';
                    e.preventDefault();
                } else if (key === '/' || key === '÷') {
                    chooseOperation('÷');
                    e.preventDefault();
                } else if (key === '*' || key === '×') {
                    chooseOperation('×');
                    e.preventDefault();
                } else if (key === '-' || key === '−') {
                    chooseOperation('−');
                    e.preventDefault();
                } else if (key === '+' || key === '+') {
                    chooseOperation('+');
                    e.preventDefault();
                } else if (key === '=' || key === 'Enter') {
                    handleEquals();
                    announcer.textContent = 'equals';
                    e.preventDefault();
                }
            });

            // initial display
            applyTheme(getInitialTheme());
            updateDisplay();
        })();
