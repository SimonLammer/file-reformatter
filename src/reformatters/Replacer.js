onmessage = function(e) {
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var results = input.map(function(i) {
		i.content = i.content.replace(args[0], args[1]);
		return i;
	});

	postMessage(results);
}
