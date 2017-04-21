# File reformatter

1. Select input files
1. Choose a Reformatter
1. Set additional arguments (depends on Reformatter)
1. Click "Reformat"
1. Wait until the Reformatter completes
1. Save the output files

# Contribute
## How do Reformatters work?

The 'Replacer'-Reformatter ([Replacer.js](/src/reformatters/Replacer.js)) is a very simple one.
It replaces the first occurance of a pattern with another pattern in every input file.
If the pattern can not be found in an input file, the Reformatter generates a 'error.txt' file instead.

Each Reformatter is created as a webworker. Thus, the main entrypoint of every Reformatter is the ```onmessage``` function.  Any input to the Reformatter is passed via the ```e.data``` array.

1. The first element in ```e.data``` is the code in the ```Reformatter.prototype.base``` function (defined in [reformatterBase.js](/src/reformatterBase.js)). It contains functions that simplify the process of creating a Reformatter. Just pass it to ```eval``` in order to use it.
1. The second element in ```e.data``` is an array of all input files (```input: [{name: 'filename.txt', content: 'Hello World'}, ...]```).
1. Following the second element in ```e.data``` are additional parameters specified by the Reformatter in [javascript.js](/src/javascript.js) as strings.
```
onmessage = function(e) {
	var base = e.data.splice(0, 1)[0];
	eval(base);
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	// ...
}
```

To indicate progress, the Reformatter interacts with a ```Progress``` object. This progress is separated in Stages, which can be nested.

Stage creation is simplified by the ```createStages``` function which accepts "raw Stages". A raw Stage is either a string (```'Stagename'```) or an object (```{name: 'Stagename', stages: ['Substagename', ...]}```).

Stages can be nested indefinitely: 
```
{
	name: 'Level 1',
	stages: [
		'Level 2 - A',
		{
			name: 'Level 2 - B',
			stages: [
				'Level 3 - A',
				{
					name: 'Level 3 - B'
					stages: [...]
				}
			]
		}
	]
}
```

The Progress object creation may look like the following:
```
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
```
This Progress has two Stages: 'Started' and 'Reformat input files'. Furthermore, the second Stage contains one Stage for every input file.

The interaction with this object happens using the following functions:

### Progress functions

Name | Description
----:|:----
```setData(data)``` | Associate data with the current progress.
```getCurrentStage()``` | Get the current Stage.

### Stage functions

Name | Description
----:|:----
```complete()``` | Indicate that the Stage has been completed.
```getCurrentSubstage()``` | Get the current Substage.
```completeSubstage()``` | Indicate that the current Substage has been completed. Equal to ```getCurrentSubstage().complete()```.

### Additional utility functions

Name | Description
----:|:----
debug(value) | Stop the program and generate a 'debug.json' file containing a JSON representation of ```value```.
error(errorMessage) | Stop the program and generate a 'error.txt' file containing ```errorMessage```.

### Completing the Replacer-Reformatter

```
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
```

## Registering a Reformatter

After completing the [javascript file](/src/reformatters/Replacer.js), the Reformatter has to be added to the reformatters array in [javascript.js](/src/javascript.js), so it may be selected.

```
var reformatters = [
	// ...
	new Reformatter('Replacer', ['old pattern', 'new pattern']),
	// ...
];
```
1. The first argument to the ```Reformatter``` constructor is the filename (without '/src/reformatters' and '.js').
1. The second argument is an array of the arguments of the Reformatter.