function reformat(input) {
	//split input into purchases
	var purchases = [];
	var purchase = null;
	var lines = input.split('\n');
	for (var i = 0; i < lines.length; i++) {
		var match = lines[i].match(/([^"]*;)+"\s*(\d+)-\s*(\d+)-\s*(\d+)\s*\d+\s*(\d+):(\d+)\s*"/);
		if (match) {
			if (purchase != null) {
				purchases.push(purchase);
			}
			purchase = {
				'day': match[2],
				'month': match[3],
				'year': match[4],
				'hour': match[5],
				'minute': match[6],
				'isBulletin': false,
				'lines': []
			};
		} else {
			if (purchase != null) {
				purchase.lines.push(lines[i]);
			}
		}
	}

	// parse purchase lines
	var bulletin = null;
	purchases = purchases.map(function(p) {
		var summaryStartIndex = -1;
		for (var i = 1; i < p.lines.length; i++) {
			if (p.lines[i].indexOf('Gesamt') > -1) {
				summaryStartIndex = i;
				break;
			} else if (p.lines[i].indexOf('Tagesbericht') > -1) {
				p.isBulletin = true;
				break;
			}
		}
		if (summaryStartIndex == -1 && !p.isBulletin) {
			return false;
		}
		p.id = p.lines[0].match(/([^"]*;)+"\s*(#\d+ \d+ \d+)/)[2];
		if (p.isBulletin) {
			bulletin = p;
		} else {
			p.products = [];
			// parse products
			for (var i = 1; i < summaryStartIndex; i++) {
				var product = parseProductLine(p.lines[i]);
				if (product) {
					if (product.quantity[0] === '-') {
						if (p.lines[i-1].indexOf('Retour') > -1) {
							product.note = 'Retour';
						} else if (p.lines[i-1].indexOf('Sofort Storno') > -1) {
							if (p.products.length > 0 && ('-' + p.products[p.products.length - 1].quantity) === product.quantity) {
								p.products.splice(p.products.length - 1, 1);
								continue;
							} else {
								product.note = 'Sofort Storno';
							}
						}
					}
					p.products.push(product);
				}
			}	
			
			// parse summary
			p.summary = parseProductLine(p.lines[summaryStartIndex]);
			delete p.summary.name;
			delete p.summary.note;
			p.summary.vats = {};
			for (var i = summaryStartIndex + 1; i < p.lines.length; i++) {
				var match = p.lines[i].match(/([^"]*;)+"\s+MwSt\s*(\d+%)\s*(-?\d+\.\d+)/);
				if (match) {
					p.summary.vats[match[2]] = match[3];
				}
			}
		}
		return p;
	});

	return JSON.stringify(purchases, null, 2);
}

function parseProductLine(line) {
	var match = line.match(/([^"]*;)+"(-?\d+(\.\d+)?)\s+(.*?)\s+(-?\d+\.\d+)/);
	if (match) {
		return {
			'quantity': match[2],
			'name': match[4],
			'price': match[5],
			'note': ''
		};
	} else {
		return false;
	}
}

onmessage = function(e) {
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var results = input.map(function(i) {
		i.content = reformat(i.content);
		return i;
	});

	postMessage(results);
}
