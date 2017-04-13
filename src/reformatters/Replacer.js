onmessage = function(e) {
	var input = e.data.splice(0, 1)[0];
	var args = e.data;
	postMessage(input.replace(args[0], args[1]));
}
