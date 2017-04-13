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
			p.counter = p.lines[4].match(/([^"]*;)+"\s*Z[^\d]*([^"]*)"/);
			p.quantity = p.lines[5].match(/([^"]*;)+"\s*A[^\d]*([^"]*)"/);
			p.price = p.lines[6].match(/([^"]*;)+"\s*B[^\d]*([^"]*)"/);
			if (p.counter && p.quantity && p.price) {
				p.counter = p.counter[2];
				p.quantity = p.quantity[2];
				p.price = p.price[2];
			} else {
				throw 'Bulletin not parsable: ' + JSON.stringify(p, null, 2);
			}
			
			// parse products
			p.products = [];
			var taxesStartIndex = -1;
			for (var i = 8; i < p.lines.length; i++) {
				if (p.lines[i].indexOf('Steuern') > -1) {
					taxesStartIndex = i;
					break;
				}
			}
			for (var i = 8; i < taxesStartIndex; i+=4) {
				var product = {
					'id': p.lines[i].match(/([^"]*;)+"\s*(#\d+)/)[2],
					'name': p.lines[i+1].match(/([^"]*;)+"\s*([^"]*?)\s*"/)[2],
					'quantity': p.lines[i+2].match(/([^"]*;)+"\s*A[^ ]+ +([^"]*)"/)[2],
					'price': p.lines[i+3].match(/([^"]*;)+"\s*B[^ ]+ +([^"]*)"/)[2]
				};
				p.products.push(product);
			}
			var paymentMethodsStartIndex = -1;
			for (var i = taxesStartIndex; i < p.lines.length; i++) {
				if (p.lines[i].indexOf('Zahlungsarten') > -1) {
					paymentMethodsStartIndex = i;
					break;
				}
			}
			p.taxes = {};
			for (var i = taxesStartIndex + 1; i < paymentMethodsStartIndex; i+=4) {
				p.taxes[p.lines[i].match(/([^"]*;)+"\s*MwSt\s*([^"]*?)\s*"/)[2]] = p.lines[i+3].match(/([^"]*;)+"\s*MwSt\s*([^"]*)"/)[2];
			}
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
			p.summary.taxes = {};
			for (var i = summaryStartIndex + 1; i < p.lines.length; i++) {
				var match = p.lines[i].match(/([^"]*;)+"\s+MwSt\s*(\d+%)\s*(-?\d+\.\d+)/);
				if (match) {
					p.summary.taxes[match[2]] = match[3];
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
