const expression = document.getElementById('expression');
const validate_result = document.getElementById('expression-valid');
const chart_ctx = document.getElementById('chart');

const chart = new Chart(chart_ctx, {
	type: 'line',
	data: {
		datasets: [
			{
				label: 'Probability Function',
				data: ([{ x: 0, y: 0 }, { x: 100, y: 0 }])
			},
			{
				label: 'Real Results'
			}
		]
	},
	options: {
		elements: {
			point: {
				radius: 0
			}
		},
		scales: {
			xAxes: [{
				type: 'linear',
				position: 'bottom',
				ticks: {
					min: 0,
					max: 1,
				}
			}]
			// yAxes: [{
			// 	type: 'linear',
			// 	position: 'left',
			// 	ticks: {
			// 		min: 0,
			// 		max: 5,
			// 	}
			// }]
		}
	}
});

// Events bound to the expression field
function validate (event) {
	try {
		const eq = math.compile(event.target.value);
		let atStart = performance.now();
		let integral = math.integrate((x) => eq.evaluate({ x }), 0, 1);
		if (Math.abs(integral - 1) > 1 / 1000) {
			throw new Error(`integral [0,1] = ${integral}`);
		}
		update();
		let atEnd = performance.now();
		validate_result.style.color = "green";
		validate_result.innerHTML = `Ok ${atEnd - atStart} ms`;
	} catch (e) {
		console.error(e);
		validate_result.style.color = "red";
		validate_result.innerHTML = e;
	}
}
function update () {
	const expr = math.compile(expression.value);
	let results = [];
	for (let i = 0; i <= 1.1; i += 1 / 100) {
		results.push(
			{ x: i, y: expr.evaluate({ x: i }) }
		);
	}
	try {
		chart.data.datasets[0].data = results;
		var xScale = chart.scales['x-axis-0'];
		var yScale = chart.scales['y-axis-0'];
		chart.options.scales.xAxes[0].left = 0;
		chart.options.scales.xAxes[0].right = 100;
		chart.update();
		chart.data.labels.update();
	} catch {
		return results;
	}
}
let events = [
	'change',
	'blur',
	'keyup',
	'paste'
];
let callbacks = [
	validate
];
for (const name of events) {
	for (const callback of callbacks) {
		expression.addEventListener(name, callback);
	}
}

// Code for real random sampling
const samplesCount = document.getElementById('sample-count');
const bucketsCount = document.getElementById('bucket-count');
const generate = document.getElementById('generate-samples');
const clear = document.getElementById('clear-samples');
const samplingStatus = document.getElementById('sample-status');

let samples = [];

generate.addEventListener('click', async () => {
	samplingStatus.innerHTML = 'Generating...';
	await new Promise(resolve => setTimeout(resolve, 10));
	const goal = samplesCount.value;
	let expr = math.compile(expression.value);
	let func = (x) => { return expr.evaluate({ x }); };
	for (let i = 0; i < goal; i++) {
		let raw = Math.random();
		let result = integrateUntil(func, raw);
		samples.push(result);
	}
	await updateSamples();
});

clear.addEventListener('click', () => {
	samples = [];
	updateSamples();
	samplingStatus.innerHTML = 'Cleared';
});

bucketsCount.addEventListener('change', updateSamples);

async function updateSamples () {
	samplingStatus.innerHTML = 'Updating graph...';
	await new Promise(resolve => setTimeout(resolve, 10));
	let count = bucketsCount.value;
	let buckets = [];
	for (let i = 1; i <= count; i++) {
		buckets.push(0);
	}
	for (const sample of samples) {
		let bucket = Math.floor(sample * count);
		buckets[bucket]++;
	}
	for (let i = 0; i < buckets.length; i++) {
		buckets[i] /= samples.length;
		buckets[i] = {
			x: (1 / count) * (i + 1),
			y: buckets[i]
		};
	}
	chart.data.datasets[1].data = buckets;
	chart.update();
	samplingStatus.innerHTML = 'Done.';
}

// Add integral support

function integrateUntil (f, tgt, step) {
	let total = 0;
	step = step || 0.01;
	for (let x = 0; tgt - total > 0; x += step) {
		total += f(x + step / 2) * step;
	}
	return total;
}

{
	/**
 * Calculate the numeric integration of a function
 * @param {Function} f
 * @param {number} start
 * @param {number} end
 * @param {number} [step=0.01]
 */
	function integrate (f, start, end, step) {
		let total = 0;
		step = step || 0.01;
		for (let x = start; x < end; x += step) {
			total += f(x + step / 2) * step;
		}
		return total;
	}

	/**
	 * A transformation for the integrate function. This transformation will be
	 * invoked when the function is used via the expression parser of math.js.
	 *
	 * Syntax:
	 *
	 *     integrate(integrand, variable, start, end)
	 *     integrate(integrand, variable, start, end, step)
	 *
	 * Usage:
	 *
	 *     math.evaluate('integrate(2*x, x, 0, 2)')
	 *     math.evaluate('integrate(2*x, x, 0, 2, 0.01)')
	 *
	 * @param {Array.<math.Node>} args
	 *            Expects the following arguments: [f, x, start, end, step]
	 * @param {Object} math
	 * @param {Object} [scope]
	 */
	integrate.transform = function (args, math, scope) {
		// determine the variable name
		if (!args[1].isSymbolNode) {
			throw new Error('Second argument must be a symbol');
		}
		const variable = args[1].name;

		// evaluate start, end, and step
		const start = args[2].compile().evaluate(scope);
		const end = args[3].compile().evaluate(scope);
		const step = args[4] && args[4].compile().evaluate(scope); // step is optional

		// create a new scope, linked to the provided scope. We use this new scope
		// to apply the variable.
		const fnScope = Object.create(scope);

		// construct a function which evaluates the first parameter f after applying
		// a value for parameter x.
		const fnCode = args[0].compile();
		const f = function (x) {
			fnScope[variable] = x;
			return fnCode.evaluate(fnScope);
		};

		// execute the integration
		return integrate(f, start, end, step);
	};

	// mark the transform function with a "rawArgs" property, so it will be called
	// with uncompiled, unevaluated arguments.
	integrate.transform.rawArgs = true;

	// import the function into math.js. Raw functions must be imported in the
	// math namespace, they can't be used via `evaluate(scope)`.
	math.import({
		integrate: integrate
	});

	// use the function in JavaScript
	function f (x) {
		return math.pow(x, 0.5);
	}
}