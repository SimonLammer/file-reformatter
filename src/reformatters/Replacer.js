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
	var progress = new Progress(createStages(rawStages));
	progress.getCurrentStage().complete();

	var results = input.map(function(i) {
		i.content = i.content.replace(args[0], args[1]);
		progress.getCurrentStage().getCurrentSubstage().complete();
		return i;
	});
	progress.setData(results);
	progress.getCurrentStage().complete();
}
