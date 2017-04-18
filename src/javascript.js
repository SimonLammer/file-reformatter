if (!window.Worker) {
	alert('This website can not be used, because your browser does not support the Worker api!');
}
var reformatters = [
	new Reformatter('Replacer', ['replace', 'with']),
	new Reformatter('Hoffelner-Cashdesk', ['Decimal mark', 'Products filename', 'Taxes filename'])
];
reformatters.forEach(function(r) {
	reformatters[r.name] = r;
});
var selectedReformatter = null;

$(document).ready(function() {
	$('#reformatter').html(
		'<option value="">-----</option>' + 
		reformatters
			.map(function(r) { 
				return '<option value="' + r.name + '">' + r.name + '</option>';
			})
			.join("\n")
	).change(function(e) {
		var selectedReformatterName = $(e.target).val();
		selectedReformatter = selectedReformatterName === '' ? null : reformatters[selectedReformatterName];
		$('#submit').attr('disabled', selectedReformatter === null);
		if (selectedReformatter) {
			$('#arguments').html(
				selectedReformatter.argumentNames.map(function(a, i) {
					return a + ': <input type="text" />';
				})
			);
		} else {
			$('#arguments').html('');
		}
	});
	
	$('#submit').click(function() {
		var inputFiles = $('#inputfiles')[0].files;
		var fileContents = [];
		var finished = [];
		for (var i = 0; i < inputFiles.length; i++) {
			(function(index) {
				finished[index] = false;
				var reader = new FileReader();
				reader.onload = function(e) {
					fileContents[index] = {
						'name': inputFiles[index].name,
						'content': reader.result
					};
					finished[index] = true;
					if (finished.indexOf(false) == -1) { // all files read
						var args = [fileContents];
						$('#arguments input').each(function(i, e) {
							args.push($(e).val());
						});
						console.log(fileContents, args);
						selectedReformatter.reformat(args);
					}
				}
				reader.readAsText(inputFiles[index]);
			})(i);
		};
	});
});

function Reformatter(name, argumentNames) {
	this.name = name;
	this.argumentNames = argumentNames;
	this.worker = null;
}
Reformatter.prototype.reformat = function(args) {
	if (this.worker === null) {
		this.worker = new Worker('reformatters/' + this.name + '.js');
		this.worker.onmessage = function(e) {
			console.log('Reformatter: ', e.data);
			if (e.data.completedStages == e.data.stages.length) {
				e.data.data.forEach(function(resultFile, i) {
					downloadStringAsFile(resultFile.name, resultFile.content);
				});
			}
		};
	}
	var code = this.base.toString();
	code = code.substr(code.indexOf('{') + 1, code.lastIndexOf('}')-code.indexOf('{') - 1);
	args.splice(0, 0, code); // pass code of Reformatter.prototype.base as first argument
	this.worker.postMessage(args);
};

function downloadStringAsFile(filename, contents) {
	$a = $('<a>', {
		'href': 'data:text/plain;charset=utf-8,' + encodeURIComponent(contents),
		'download': filename,
		'target': '_blank'
		//'style': 'display: none'
	});
	$('body').append($a);
	var evObj = document.createEvent('MouseEvents');
	evObj.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
	$a[0].dispatchEvent(evObj);
	$a.remove();
}