onmessage = function(e) {
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var results = input.map(function(i) {
		return i.replace(args[0], args[1]);
	});

	postMessage(results);
}
