onmessage = function(e) {
	var base = e.data.splice(0, 1)[0];
	eval(base);
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var rawStages = [
		'Started',
		{
			name: 'Reformat input files',
			stages: input.map(function(i) {
				return 'Reformat ' + i.name;
			})
		}
	];
	for (var i = 0; i < 50; i++) {
		rawStages.push('DEBUG ' + i);
	}
	var progress = new Progress(createStages(rawStages));
	progress.getCurrentStage().complete();

	setTimeout(function() {
		var results = input.map(function(i) {
			//debug(i); // useful for debugging
			i.content = i.content.replace(args[0], args[1]);
			progress.getCurrentStage().getCurrentSubstage().complete();
			return i;
		});
		progress.setData(results);
		progress.getCurrentStage().complete();

		for (var i = 0; i < 50; i++) {
			setTimeout(function() {
				progress.getCurrentStage().complete();
			}, i * 350);
		}
	}, 3000);
}
