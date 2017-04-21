onmessage = function(e) {
	var base = e.data.splice(0, 1)[0];
	eval(base);
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var oldPattern = args[0];
	var newPattern = args[1];

	var rawStages = [
		'Started',
		{
			name: 'Reformat input files',
			stages: input.map(function(inputFile) {
				return 'Reformat ' + inputFile.name;
			})
		}
	];
	var progress = new Progress(createStages(rawStages));
	progress.getCurrentStage().complete(); // complete stage 'Started'

	var results = input.map(function(inputFile) {
		if (inputFile.content.indexOf(oldPattern) === -1) {
			error('Pattern "' + oldPattern + '" not found in ' + inputFile.name);
		}
		inputFile.content = inputFile.content.replace(oldPattern, newPattern);
		progress.getCurrentStage().getCurrentSubstage().complete();
		return inputFile;
	});
	progress.setData(results);
	progress.getCurrentStage().complete(); // complete stage 'Reformat input fies'
}
