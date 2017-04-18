Reformatter.prototype.base = function() { // this code will be executed first in every reformatter
	function createStages(rawStages) {
		/* rawStages = [
			'Stage 1',
			{
				'name': 'Stage 2',
				'stages': ['Substage 1','Substage 2']
			},
			{
				'name': 'Stage 3',
				'stages': [
					'Substage 1',
					{
						'name': 'Substage 2',
						'stages': ['Subsubstage 1', 'Subsubstage 2']
					}
				]
			}
		] */
		return rawStages.map(function(s) {
			if (typeof(s) === 'string') {
				return new Stage(s, []);
			} else {
				return new Stage(s.name, createStages(s.stages));
			}
		});
	}
	function Stage(name, substages, completionCallback) {
		this.name = name;
		this.substages = substages;
		this.completedSubstages = 0;
		this.completionCallback = completionCallback;

		var self = this;
		this.substages.forEach(function(s) {
			s.completionCallback = function() {
				self.completeSubstage();
			};
		});
	}
	Stage.prototype.getCurrentSubstage = function() {
		return this.substages[this.completedSubstages];
	};
	Stage.prototype.completeSubstage = function() {
		this.completedSubstages++;
		this.update();
	};
	Stage.prototype.complete = function() {
		if (this.completionCallback) {
			this.completionCallback();
		}
	};
	Stage.prototype.setUpdate = function(update) {
		this.update = update;
		this.substages.forEach(function(s) {
			s.setUpdate(update);
		});
	};
	function Progress(stages) {
		this.stages = stages;
		this.completedStages = 0;
		this.data = null;

		var self = this;
		this.updateCounter = 0;
		this.update = function() {
			postMessage(JSON.parse(JSON.stringify(self)));
			self.updateCounter++;
		}
		this.stages.forEach(function(s) {
			s.setUpdate(self.update);
			s.completionCallback = function() {
				self.completedStages++;
				self.update();
			};
		});
	}
	Progress.prototype.getCurrentStage = function() {
		return this.stages[this.completedStages];
	};
	Progress.prototype.setData = function(data) {
		this.data = data;
		this.update();
	};
	function debug(val) {
		postMessage({
			'data': [{'name':'debug.json','content':JSON.stringify(val,null,2)}],
			'stages': [],
			'completedStages': 0
		});
		throw 'debug';
	}
};