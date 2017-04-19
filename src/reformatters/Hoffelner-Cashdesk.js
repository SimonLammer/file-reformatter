function parseCashdeskLog(progress, productList, taxList, input) {
	//split input into purchases
	var purchases = [];
	progress.setData(purchases);
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
	progress.getCurrentStage().getCurrentSubstage().completeSubstage();

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
		p.id = p.lines[0].match(/([^"]*;)+"\s*([^"]+)\s*"/)[2].trim();
		if (p.isBulletin) {
			bulletin = p;
			p.summary = {
				'counter': p.lines[4].match(/([^"]*;)+"\s*Z[^\d]*([^"]*)"/),
				'quantity': p.lines[5].match(/([^"]*;)+"\s*A[^\d]*([^"]*)"/),
				'price': p.lines[6].match(/([^"]*;)+"\s*B[^\d]*([^"]*)"/)
			};
			if (p.summary.counter && p.summary.quantity && p.summary.price) {
				p.summary.counter = p.summary.counter[2];
				p.summary.quantity = p.summary.quantity[2];
				p.summary.price = p.summary.price[2];
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
				product.number = parseInt(product.id.substr(1));
				p.products.push(product);
			}
			var paymentMethodsStartIndex = -1;
			for (var i = taxesStartIndex; i < p.lines.length; i++) {
				if (p.lines[i].indexOf('Zahlungsarten') > -1) {
					paymentMethodsStartIndex = i;
					break;
				}
			}
			p.summary.taxes = {};
			for (var i = taxesStartIndex + 1; i < paymentMethodsStartIndex; i+=4) {
				p.summary.taxes[p.lines[i].match(/([^"]*;)+"\s*MwSt\s*([^"]*?)\s*"/)[2]] = p.lines[i+3].match(/([^"]*;)+"\s*MwSt\s*([^"]*)"/)[2];
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
	progress.getCurrentStage().getCurrentSubstage().completeSubstage();

	// remove invalid purchases
	purchases = purchases.filter(function(p) {
		return p != false && p.products.length > 0;
	});

	// parse numbers
	purchases.forEach(function(purchase) {
		purchase.products.forEach(function(product) {
			product.price = parseFloat(product.price.replace(/,/g, ''));
			product.quantity = parseFloat(product.quantity.replace(/,/g, ''));
		});
		purchase.summary.quantity = parseInt(purchase.summary.quantity);
		purchase.summary.price = parseFloat(purchase.summary.price.replace(/,/g, ''));
		for (var tax in purchase.summary.taxes) {
			purchase.summary.taxes[tax] = parseFloat(purchase.summary.taxes[tax].replace(/,/g, ''));
		}
	});
	progress.getCurrentStage().getCurrentSubstage().completeSubstage();

	// remove bulletin
	purchases = purchases.filter(function(p) {
		return !p.isBulletin;
	});

	// update product names of purchases
	var unmatchedProductNames = [];
	purchases.forEach(function(purchase) {
		purchase.products.forEach(function(product) {
			var possibleProducts = [];
			bulletin.products.forEach(function(p) {
				if (p.name.indexOf(product.name) > -1) {
					possibleProducts.push(p);
				}
			});
			if (possibleProducts.length === 0) {
				//throw 'No product name matched "' + product.name + '"!';
				var foundName = false;
				for (var i = 0; i < unmatchedProductNames.length; i++) {
					if (unmatchedProductNames[i].indexOf(product.name) > -1 || product.name.indexOf(unmatchedProductNames[i])) {
						product.name = unmatchedProductNames[i];
						foundName = true;
						break;
					}
				}
				if (!foundName) {
					unmatchedProductNames.push(product.name);
				}
				product.note = "Productname not found in bulletin";
			} else if (possibleProducts.length === 1) {
				product.name = productList[possibleProducts[0].number].name;
			} else {
				var pricePerQuantity = product.price / product.quantity;
				var minDelta = Number.POSITIVE_INFINITY;
				var prod = null;
				possibleProducts.forEach(function(p) {
					var delta = Math.abs(pricePerQuantity - p.price / p.quantity);
					if (delta < minDelta) {
						minDelta = delta;
						prod = p;
					}
				});
				product.name = productList[prod.number].name;
			}
		});
	});
	progress.getCurrentStage().getCurrentSubstage().completeSubstage();
	
	// combine equal products of purchases
	var productCombinations = 0;
	purchases.forEach(function(purchase) {
		for (var i = 0; i < purchase.products.length; i++) {
			for (var j = i + 1; j < purchase.products.length; j++) {
				if (purchase.products[i].name === purchase.products[j].name) {
					productCombinations++;
					var p = purchase.products.splice(j, 1)[0];
					purchase.products[i].price += p.price;
					purchase.products[i].quantity += p.quantity;
					purchase.products[i].note = 'Kombiniert';
					j--;
				}
			}
		}
	});
	progress.getCurrentStage().getCurrentSubstage().completeSubstage();

	// update bulletin product names
	bulletin.products.forEach(function(product) {
		product.name = productList[product.number].name;
	});
	
	return {
		'bulletin': bulletin,
		'purchases': purchases
	};
}

function parseProductLine(line) {
	var match = line.match(/([^"]*;)+"(-?\d*(\.\d+)?)\s+(.*?)\s+(-?\d+\.\d+)/);
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

function createCsvHeader(productList, taxList) {
	var csv = 'RechnungsNr;Tag;Monat;Jahr;Stunde;Minute;Gesamtpreis';
	taxList.forEach(function(tax) {
		csv += ';' + tax + ' MwSt Anteil';
	});
	for (var i in productList) {
		csv += ';' + productList[i].name + ' Menge;' + productList[i].name + ' Preis';
	};
	return csv;
}

function createCsv(productList, taxList, decimalMark, items) {
	var csv = '';
	items.forEach(function(item) {
		csv += '\n';
		csv += [item.id, item.day, item.month, item.year, item.hour, item.minute, item.summary.price].join(';');
		taxList.forEach(function(tax) {
			csv += ';';
			if (item.summary.taxes[tax] != undefined) {
				csv += item.summary.taxes[tax];
			} else {
				csv += '0';
			}
		});
		for (var pIndex in productList) {
			csv += ';';
			var hasProduct = false;
			for (var i = 0; i < item.products.length; i++) {
				if (productList[pIndex].name === item.products[i].name) {
					csv += [item.products[i].quantity, item.products[i].price].join(';');
					hasProduct = true;
					break;
				}
			}
			if (!hasProduct) {
				csv += '0;0';
			}
		}
	});
	return createCsvHeader(productList, taxList) + csv.replace(/\./g, decimalMark);
}

function readProductList(input) {
	var lines = input.split('\n');
	var productList = [];
	for (var i = 1; i < lines.length; i++) {
		var spl = lines[i].split(';');
		var product = {
			'number': parseFloat(spl[0].trim()),
			'name': spl[1].trim()
		};
		productList[product.number] = product;
	}
	return productList;
}

onmessage = function(e) {
	var base = e.data.splice(0, 1)[0];
	eval(base);
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var rawStages = [
		'Started',
		'Read \'Products file\' and \'Taxes file\'',
		{
			'name': 'Parse input files',
			'stages': input.filter(function(i) {
				return i.name != args[1] && i.name != args[2];
			}).map(function(i) {
				return {
					'name': 'Parse ' + i.name,
					'stages': ['Split file into purchases', 'Parse purchases', 'Parse numbers', 'Update product names', 'Combine equal products']
				}
			})
		},
		'Create csv files'
	];
	var progress = new Progress(createStages(rawStages));
	progress.getCurrentStage().complete();

	var productList = null;
	var taxList = null;
	for (var i = 0; i < input.length && (productList == null || taxList == null); i++) {
		if (input[i].name == args[1]) { // i is product-list
			productList = input.splice(i, 1)[0];
			productList = readProductList(productList.content);
			i--;
		} else if (input[i].name == args[2]) { // i is tax-list
			taxList = input.splice(i, 1)[0];
			taxList = taxList.content.split(';');
			i--;
		}
	}
	if (productList == null) {
		throw 'Product list not found in input files!';
	} else if (taxList == null) {
		throw 'Tax list not found in input files!';
	}
	progress.getCurrentStage().complete();

	var purchases = [];
	var bulletins = [];
	input.forEach(function(i) {
		//try {
		var x = parseCashdeskLog(progress, productList, taxList, i.content);
		//} catch(err) { debug([i.name, err]); }
		purchases = purchases.concat(x.purchases);
		bulletins.push(x.bulletin);
	});
	progress.setData({'purchases': purchases, 'bulletins': bulletins});
	progress.getCurrentStage().complete();

	var result = [{
		'name': 'Einkäufe.csv',
		'content': createCsv(productList, taxList, args[0], purchases)
	}, {
		'name': 'Tagesberichte.csv',
		'content': createCsv(productList, taxList, args[0], bulletins)
	}];
	progress.setData(result);
	progress.getCurrentStage().complete();
}
