onmessage = function(e) {
	var base = e.data.splice(0, 1)[0];
	eval(base);
	var input = e.data.splice(0, 1)[0];
	var args = e.data;

	var productListFilename = args[1];
	var taxesListFilename = args[2];

	var rawStages = [
		'Started',
		'Read \'Products file\' and \'Taxes file\'',
		{
			'name': 'Parse input files',
			'stages': input.filter(function(i) {
				return i.name != productListFilename && i.name != taxesListFilename;
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

	progress.setData(readAndRemoveProductsListAndTaxesList(progress, input, productListFilename, taxesListFilename));
	var productList = progress.data.productList;
	var taxList = progress.data.taxList;
	if (productList == null) {
		error('Product list not found in input files!');
	} else if (taxList == null) {
		error('Tax list not found in input files!');
	}
	progress.getCurrentStage().complete();

	var purchases = [];
	var bulletins = [];
	input.forEach(function(i) {
		try {
			parseCashdeskLog(progress, productList, taxList, i.content);
		} catch(err) {
			error('Error in "' + i.name + '": \n' + err);
		}
		purchases = purchases.concat(progress.data.purchases);
		bulletins.push(progress.data.bulletin);
		progress.getCurrentStage().completeSubstage();
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

function readAndRemoveProductsListAndTaxesList(progress, input, productsListFilename, taxesListFilename) {
	var lists = {};
	for (var i = 0; i < input.length && (lists.productList == undefined || lists.taxList == undefined); i++) {
		if (input[i].name == productsListFilename) { // i is product-list
			lists.productList = input.splice(i, 1)[0];
			lists.productList = readProductList(lists.productList.content);
			i--;
		} else if (input[i].name == taxesListFilename) { // i is tax-list
			lists.taxList = input.splice(i, 1)[0];
			lists.taxList = lists.taxList.content.split(';');
			i--;
		}
	}
	return lists;
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
	var parseProductLine = function (line) {
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
			
			// parse bulletin products
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
					'id': p.lines[i].match(/([^"]*;)+"\s*(#\d+)/),
					'name': p.lines[i+1].match(/([^"]*;)+"\s*([^"]*?)\s*"/),
					'quantity': p.lines[i+2].match(/([^"]*;)+"\s*A[^ ]+ +([^"]*)"/),
					'price': p.lines[i+3].match(/([^"]*;)+"\s*B[^ ]+ +([^"]*)"/)
				};
				if (product.id && product.name && product.quantity && product.price) {
					product.id = product.id[2];
					product.name = product.name[2];
					product.quantity = product.quantity[2];
					product.price = product.price[2];
				} else {
					throw 'Product of bulletin not parsable: ' + JSON.stringify({
						'purchase': p, 
						'lines': p.lines.slice(i, i + 4),
						'product': product
					}, null, 2);
				}
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
				var taxName = p.lines[i].match(/([^"]*;)+"\s*MwSt\s*([^"]*?)\s*"/);
				var taxValue = p.lines[i+3].match(/([^"]*;)+"\s*MwSt\s*([^"]*)"/);
				if (taxName && taxValue) {
					p.summary.taxes[taxName[2]] = taxValue[2];
				} else {
					throw 'Taxes of bulletin not parsable: ' + JSON.stringify(p, null, 2);
				}
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
			
			// parse product summary
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
				product.note = "Product name not found in bulletin";
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
	
	progress.setData({
		'bulletin': bulletin,
		'purchases': purchases
	});
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
