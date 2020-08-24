const fs = require('fs');
const puppeteer = require("puppeteer");
const laundry = require('company-laundry');

const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const pageTimeout = 30000; // Set timeout for individual contract pages

async function getAllYears() {
    const baseURL = 'http://compras.imss.gob.mx/?P=imsscomprotipoprod';
    if(verbose) console.log('Getting list of available years...');

    // Start with hidden years (1999-2010)
    let hiddenYears = [ '1999', '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009', '2010' ];

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(baseURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#pr');

        let yearList = await page.$$eval('#pr option', options => options.map(o => {
            return o.value
        }));

        await browser.close();
        return [...hiddenYears, ...yearList];
    }
    catch (err) {
        await browser.close();
        console.log(err);
        return { status: 'ERROR', results: err };
    }
}

async function getCategories(years) {
    if(!years) {
        years = await getAllYears();
        if(years.hasOwnProperty('status') && years.status == 'ERROR') return years;
    }

    if(verbose) console.log('Processing years:', years.join(', '));

    let yearCategories = {};
    for(let i=0; i<years.length; i++) {
        let y = years[i];

        // Get the categories for each year
        let categories = await getYearCategories(y);
        yearCategories[y] = {};
        yearCategories[y]["categories"] = categories;
        yearCategories[y]["total"] = getYearTotal(categories);
    }

    return yearCategories;
}

function getYearTotal(cats) {
    let total = 0;
    cats.map(c => total += convertToFloat(c.total));
    return total;
}

async function getYearCategories(year) {
    let categories = [];
    const baseURL = 'http://compras.imss.gob.mx/?P=imsscomprotipoprod&pr=' + year;
    if(verbose) console.log('Getting categories for:', year);

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        page.setDefaultTimeout(0);
        await page.goto(baseURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#divcontenidos div.container1');

        let categories = await page.$$eval('#divcontenidos div.container1', rows => rows.map((row, j) => {
            let cat = {};
            cat["id"] = row.getAttribute('id').split('_')[1];
            const divs = [...row.getElementsByTagName('div')];
            divs.map((cell, i) => {
                switch(i) {
                    case 1:
                        cat["name"] = cell.textContent.trim();
                        break;
                    case 2:
                        cat["total"] = cell.textContent.trim();
                        break;
                }
            });
            return cat;
        }));

        if(verbose) {
            console.log('Found categories:');
            categories.map(c => console.log('-----', c.name));
        }

        for(let i=0; i<categories.length; i++) {
            if(categories[i].total != '0.00') {
                await getSubcategories(page, categories[i]);
            }
        }

        await browser.close();
        return categories;
    }
    catch (err) {
        await browser.close();
        console.log(err);
        return { status: 'ERROR', results: err };
    }
}

async function getSubcategories(page, category) {
    if(verbose) console.log('Getting subcategories for:', category.name);
    let subcats = await page.$$eval('#niv1_' + category.id + ' div.container2', rows => rows.map((row, j) => {
        let subcat = {};
        subcat["id"] = row.getAttribute('id').split('_')[1];
        const divs = [...row.getElementsByTagName('div')];
        divs.map((cell, i) => {
            switch(i) {
                case 2:
                    subcat["name"] = cell.textContent.replace('[?]', '').trim();
                    let subelems = [...cell.getElementsByTagName('a')];
                    if(subelems.length > 0) {
                        subcat["url"] = subelems[0].getAttribute('href');
                        if(subelems.length > 1) subcat["description"] = subelems[1].getAttribute("title");
                    }
                    break;
                case 3:
                    subcat["total"] = cell.textContent.trim();
                    break;
            }
        });
        return subcat;
    } ));

    if(verbose) {
        console.log('Found subcategories:');
        subcats.map(s => console.log('-----', s.name));
    }

    if(subcats.length > 0) {
        for(let k=0; k<subcats.length; k++) {
            if(!subcats[k].hasOwnProperty('url')) { // Skip those that already have URLs because they don't have rubros
                if(verbose) console.log('Getting rubros for:', subcats[k].name);
                let rubros = await page.$$eval('#niv2_' + subcats[k].id + ' div.container3', rows => rows.map((row, j) => {
                    let rubro = {};
                    const divs = [...row.getElementsByTagName('div')];
                    divs.map((cell, i) => {
                        switch(i) {
                            case 2:
                                rubro["name"] = cell.textContent.replace('[?]', '').trim();
                                let subelems = [...cell.getElementsByTagName('a')];
                                if(subelems.length > 0) {
                                    rubro["url"] = subelems[0].getAttribute('href');
                                    let urlParts = rubro["url"].split('&sub=');
                                    rubro["id"] = urlParts[1].substring(0, urlParts[1].indexOf('&'));
                                    if(subelems.length > 1) rubro["description"] = subelems[1].getAttribute("title");
                                }
                                break;
                            case 3:
                                rubro["total"] = cell.textContent.trim();
                                break;
                        }
                    });
                    return rubro;
                } ));

                if(verbose) {
                    console.log('Found rubros:');
                    rubros.map(r => console.log('-----', r.name));
                }

                subcats[k]["rubros"] = rubros;
            }
        }
    }

    category["subcategories"] = subcats;
}

function getSeenContracts(year) {
    let path = './output/' + year + '.json';
    let ids = {};

    if( fs.existsSync(path) ) {
        if(verbose) console.log('Reading previously scraped contracts for ' + year);
        var lines = fs.readFileSync(path, 'utf-8').split('\n');
        let count = 0;
        lines.map((l) => {
            if(l.length > 0) {
                let contract = JSON.parse(l);
                ids[contract.id_ficha] = true;
                count++;
            }
        });
        if(verbose) console.log('Found ' + count + ' contracts.');
    }

    return ids;
}

async function getContracts(categories) {
    let currentCat = '';
    let currentSubcat = '';
    let currentRubro = '';

    if(verbose) console.log('\n++++++++++ ++++++++++ ++++++++++ ++++++++++ ++++++++++\n');

    for(var y in categories) {
        if(categories.hasOwnProperty(y)){
            let year = categories[y];
            if(verbose) console.log('Contracts for year:', y);

            // If present, load all previously scraped contract IDs to avoid scraping them again
            let seenContractIDs = getSeenContracts(y);

            // Iterate over categories
            for(let j=0; j<year.categories.length; j++) {
                let cat = year.categories[j];
                currentCat = cat.id;
                if(verbose) console.log('----- Category:', cat.name);

                if(skipCats && startCat != currentCat) {
                    // We should skip category
                    if(verbose) console.log('----- Skipping category');
                }
                else {
                    if(skipCats) skipCats = false;
                    if(cat.total != '0.00' && cat.subcategories.length > 0) {
                        // Iterate over subcateories
                        for(let k=0; k<cat.subcategories.length; k++) {
                            let subcat = cat.subcategories[k];
                            currentSubcat = subcat.id;
                            if(verbose) console.log('----- ----- Subcategory:', subcat.name);

                            if(skipSubcats && startSubcat != currentSubcat) {
                                if(verbose) console.log('----- ----- Skipping subcategory');
                            }
                            else {
                                if(skipSubcats) skipSubcats = false;
                                // Get contracts if we find a direct URL
                                if(subcat.hasOwnProperty('url') && subcat.url != '') {
                                    if(verbose) console.log('>>', subcat.url);
                                    subcat['contracts'] = await processResultsPage(y, seenContractIDs, subcat, currentCat, currentSubcat);
                                }
                                else if(subcat.hasOwnProperty('rubros') && subcat.rubros.length > 0) {
                                    for(let m=0; m<subcat.rubros.length; m++) {
                                        let rubro = subcat.rubros[m];
                                        currentRubro = rubro.id;
                                        if(skipRubros && startRubro != currentRubro) {
                                            if(verbose) console.log('----- ----- ----- Skipping rubro');
                                        }
                                        else {
                                            if(skipRubros) skipRubros = false;
                                            if(rubro.hasOwnProperty('url') && rubro.url != '') {
                                                if(verbose) console.log('----- ----- ----- Rubro:', rubro.name, '\n>>', rubro.url);
                                                rubro['contracts'] = await processResultsPage(y, seenContractIDs, rubro, currentCat, currentSubcat, currentRubro);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if(verbose) console.log('\n++++++++++ ++++++++++ ++++++++++ ++++++++++ ++++++++++\n');
    return categories;
}

async function processResultsPage(year, seenContractIDs, obj, catID, subcatID, rubroID=null) {
    let contracts = [];
    let contractsURL = 'http://compras.imss.gob.mx' + obj.url

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        page.setDefaultTimeout(0);
        await page.goto(contractsURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#detailgral', { timeout:60000 });

        await page.$eval('#detailresultanimf', button => button.click() );
        let resultsText = await page.$eval('#detailgral > div:nth-child(2)', elem => elem.textContent.trim());
        let resultsOverview = parseResultsText(resultsText);
        let processedContracts = 0;

        if(verbose) console.log('     ' + resultsOverview.total + ' results in ' + resultsOverview.pages + ' pages.');

        if(resultsOverview.total > 0 && resultsOverview.pages > 0) {
            let interval = 0;
            let pageURL = '';

            // Get results pages one by one, collecting contracts summary
            for(let i=1; i<=resultsOverview.pages; i++) {
                if(verbose) process.stdout.write('\r     Page ' + i + ' of ' + resultsOverview.pages + '. ');

                //await page.$eval('#vermascont', button => button.click() );
                //await page.waitForResponse('http://compras.imss.gob.mx/?P=imsscomprotipoproddetajx');

                pageURL = contractsURL.replace('imsscomprotipoproddet', 'imsscomprotipoproddetajx') + '&ajx=1&corderdir=up&pg=' + i;
                let response = await page.goto(pageURL, { referer: page.url() });
                let json = await response.json();

                // Each response contains info for 50 contracts, so build contract objects from the response
                let pageContracts = parseResultsJSON(json);
                addContractCategorization(pageContracts, catID, subcatID, rubroID);
                processedContracts += pageContracts.length;
                if(verbose) process.stdout.write( processedContracts + ' of ' + resultsOverview.total + ' contracts.');
                contracts.push(...pageContracts);

                // Randomize wait time between AJAX requests (1 to 2 seconds)
                interval = Math.floor(Math.random() * 1000) + 1000;
                await page.waitFor(interval);
            }

            let totalContracts = contracts.length;
            let contractStatus = null;
            let failedContracts = [];

            for(let n=0; n<totalContracts; n++) {
                let seen = findContractByID(contracts[n].id_ficha, seenContractIDs);
                if(!seen) {
                    if(verbose) process.stdout.write('\r     Getting details for contract ' + (n+1) + ' of ' + totalContracts + '.');
                    contractStatus = await getContractDetails(page, contracts[n]);
                    if(contractStatus == false) {
                        failedContracts.push(contracts[n]);
                    }
                    else if(output == 'file') writeContract(contractStatus, year);
                }
                else {
                    if(verbose) process.stdout.write('\r     Skipping contract ' + (n+1) + ' of ' + totalContracts + '.');
                }
            }

            // TODO: retry contracts that failed...

            if(verbose) console.log('\n');
        }

        await browser.close();
    }
    catch (err) {
        await browser.close();
        console.log(err);
        return { status: 'ERROR', results: err };
    }

    return contracts;
}

function findContractByID(id, list) {
    return list.hasOwnProperty(id);
}

async function getContractDetails(page, contract) {
    let contractURL = 'http://compras.imss.gob.mx' + contract.url;
    contract.url = contractURL;

    try {
        await page.setDefaultTimeout(pageTimeout);
        await page.goto(contractURL);

        let fechas = await page.$eval('#divcontenidos > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > table:nth-child(2) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1) > div:nth-child(1) > span:nth-child(1)',
            elem => elem.textContent.trim());
        let fechasArr = fechas.split(/-|,/);

        contract['fecha_inicio'] = convertDateFormat(fechasArr[0].substring(fechasArr[0].indexOf(':')+1).trim());
        contract['fecha_fin'] = convertDateFormat(fechasArr[1].substring(fechasArr[1].indexOf(':')+1).trim());

        let detailsCompra = await page.$$eval('#divcontenidos .txtcajacompra', divs => divs.map((div, j) => {
            return div.textContent.trim();
        }));
        contract['concepto'] = detailsCompra[0];
        if(detailsCompra.length > 2) {
            let extra = detailsCompra[1].split(/:|-/g);
            contract['numero_obra'] = extra[1].trim();
        }
        contract['monto'] = convertToFloat(detailsCompra[detailsCompra.length-1].replace('$', '').trim());

        if( await page.$('#divcontenidos > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > table:nth-child(4) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > strong:nth-child(1)') !== null ) {
            let claveProd = await page.$eval('#divcontenidos > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > table:nth-child(4) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > strong:nth-child(1)',
                elem => elem.textContent.trim());
            contract['clave_producto'] = claveProd;
        }

        if( await page.$('#divcontenidos > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div > div') !== null ) {
            let documentos = await page.$eval('#divcontenidos > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div > div',
                elem => {
                    let parent = elem.parentElement;
                    let innerText = parent.innerHTML.split('</div>');
                    return innerText[innerText.length - 1].trim();
                });
            contract['documentos'] = documentos;
        }

        let infoAdicional = await page.$$eval('#divcontenidos span.txtdesccaja',
            spans => spans.map((span, j) => {
                return span.textContent.trim();
        }));
        Object.assign(contract, parseAdditionalInfo(infoAdicional));

        return contract;
    }
    catch (err) {
        console.log('\n');
        console.log(contract.url);
        console.log(err);
        console.log('\n');
        return false;
    }
}

function parseAdditionalInfo(infoArr) {
    let obj = {};

    infoArr.map(i => {
        let title = i.substr(0, i.indexOf(':'));
        if(title != '') {
            switch(title) {
                case '# Factura':
                    obj['num_factura'] = i.replace(title + ':', '').trim();
                    break;
                case '# Pedido':
                    obj['num_pedido'] = i.replace(title + ':', '').trim();
                    break;
                case '# Orden d compra':
                    obj['num_orden_compra'] = i.replace(title + ':', '').trim();
                    break;
                case 'Ambito de licitación':
                    obj['ambito_licitacion'] = i.replace(title + ':', '').trim();
                    break;
                case 'Cantidad':
                case 'Cantidad recibida':
                    obj['cantidad_recibida'] = convertToFloat(i.replace(title + ':', '').trim());
                    break;
                case 'Cantidad solicitada':
                    obj['cantidad_solicitada'] = convertToFloat(i.replace(title + ':', '').trim());
                    break;
                case 'Descripción':
                    obj['descripcion'] = i.replace(title + ':', '').trim();
                    break;
                case 'Delegación del IMSS':
                    obj['delegacion'] = i.replace(title + ':', '').trim();
                    break;
                case 'Descuento':
                    obj['descuento'] = i.replace(title + ':', '').trim();
                    break;
                case 'Estado':
                case 'Estado de la República':
                    obj['estado'] = i.replace(title + ':', '').trim();
                    break;
                case 'Estatus':
                case 'Estatus del contrato':
                    obj['estatus_contrato'] = i.replace(title + ':', '').trim();
                    break;
                case 'Fecha de entrega':
                    obj['fecha_entrega'] = convertDateFormat(i.replace(title + ':', '').trim());
                    break;
                case 'Fecha de expedición':
                    obj['fecha_expedicion'] = convertDateFormat(i.replace(title + ':', '').trim());
                    break;
                case 'Fecha factura':
                    obj['fecha_factura'] = convertDateFormat(i.replace(title + ':', '').trim());
                    break;
                case 'Fecha de inicio del contrato':
                case 'Fecha de inicio de contrato':
                    obj['fecha_inicio'] = convertDateFormat(i.replace(title + ':', '').trim());
                    break;
                case 'Fecha de fin del contrato':
                case 'Fecha de fin de contrato':
                    obj['fecha_fin'] = convertDateFormat(i.replace(title + ':', '').trim());
                    break;
                case 'IVA':
                    obj['iva'] = convertToFloat(i.replace(title + ':', '').trim());
                    break;
                case 'Localidad':
                    obj['localidad'] = i.replace(title + ':', '').trim();
                    break;
                case 'No. Procedimiento':
                case 'Procedimiento':
                    obj['num_procedimiento'] = i.replace(title + ':', '').trim();
                    break;
                case '# Contrato':
                case 'Número de contrato':
                    obj['num_contrato'] = i.replace(title + ':', '').trim();
                    break;
                case 'Precio':
                    obj['precio'] = convertToFloat(i.replace(title + ':', '').trim());
                    break;
                case 'Precio total':
                    obj['precio_total'] = convertToFloat(i.replace(title + ':', '').trim());
                    break;
                case 'Procedimiento de compra':
                case 'Tipo de adquisición':
                    obj['procedimiento'] = i.replace(title + ':', '').trim();
                    break;
                case 'Tipo de contrato':
                    obj['tipo_contrato'] = i.replace(title + ':', '').trim();
                    break;
                case 'Producto':
                    obj['producto'] = i.replace(title + ':', '').trim();
                    break;
                case 'Proveedor':
                    obj['proveedor_detalle'] = i.replace(title + ':', '').trim();
                    break;
                case 'RFC':
                    obj['rfc'] = i.replace(title + ':', '').replace(/\[.*\]\s*$/g, '').trim();
                    break;
                case 'Subprocedimiento de compra':
                    obj['subprocedimiento'] = i.replace(title + ':', '').trim();
                    break;
                case 'Unidad':
                    obj['unidad'] = i.replace(title + ':', '').trim();
                    break;
                case 'Unidad compradora':
                    obj['unidad_compradora'] = i.replace(title + ':', '').trim();
                    break;
                case 'Unidad de entrega':
                    obj['unidad_entrega'] = i.replace(title + ':', '').trim();
                    break;
                default:
                    if(!obj.hasOwnProperty('proveedor')) obj['proveedor'] = i.replace(title + ':', '').trim();
                    else if(i == 'Contrato multianual') obj['multianual'] = true;
                    else console.log('Unknown field found:', title, 'Value:', i);
                    break;
            }
        }
    })

    return obj;
}

function parseResultsText(text) {
    text = text.replace(/\[.*\]/g, '').trim();
    let textParts = text.split(' ');
    return { total: convertToFloat(textParts[0]), pages: convertToFloat(textParts[3]) }
}

function parseResultsJSON(json) {
    let contracts = [];
    let rows = json.rows;

    for(let i=0; i<rows.length; i++) {
        const dom = new JSDOM(rows[i].template);
        if(dom.window.document.querySelector('.dcontainer1') || dom.window.document.querySelector('.dcontainer2')) {
            let url = dom.window.document.querySelector('a').getAttribute('href').split('&ref=')[0];
            let id_ficha = url.replace('/?P=imsscomprofich&f=', '');
            contracts.push({
                id_ficha: convertToFloat(id_ficha),
                url: url
            });
        }
    }

    return contracts;
}

function addContractCategorization(pageContracts, catID, subcatID, rubroID) {
    pageContracts.map( c => {
        c['categoria'] = catID;
        c['subcategoria'] = subcatID;
        if(rubroID) c['rubro'] = rubroID;
    } );
}

function convertToFloat(string) {
    return parseFloat(string.replace(/\$|,/g, '').trim());
}

function convertDateFormat(string) {
    if(string.indexOf('/') > 0) {
        let dateParts = string.split('/');
        return dateParts[2] + '-' + dateParts[1] + '-' + dateParts[0];
    }
    else return string;
}

function writeContract(contract, year) {
    fs.appendFileSync('./output/' + year + '.json', JSON.stringify(contract) + "\n");
}

function saveEntities(entities) {
    switch(output) {
        case 'file':
            saveToFile(entities);
            break;
        case "stdout":
        default:
            console.log( JSON.stringify(entities, null, 4) );
            break;
    }
}

function saveToFile(entities) {
    let contracts = [];

    for(var y in entities) {
        if(entities.hasOwnProperty(y)){
            let year = entities[y];
            year['contract_count'] = 0;
            for(let j=0; j<year.categories.length; j++) {
                let cat = year.categories[j];
                cat['contract_count'] = 0;
                if(cat.total != '0.00' && cat.subcategories.length > 0) {
                    for(let k=0; k<cat.subcategories.length; k++) {
                        let subcat = cat.subcategories[k];
                        subcat['contract_count'] = 0;
                        if(subcat.hasOwnProperty('url') && subcat.url != '') {
                            if(subcat.hasOwnProperty('contracts')) {
                                subcat['contract_count'] += subcat.contracts.length;
                                cat['contract_count'] += subcat.contracts.length;
                                year['contract_count'] += subcat.contracts.length;
                                delete subcat.contracts;
                            }
                        }
                        else if(subcat.hasOwnProperty('rubros') && subcat.rubros.length > 0) {
                            for(let m=0; m<subcat.rubros.length; m++) {
                                let rubro = subcat.rubros[m];
                                if(rubro.hasOwnProperty('url') && rubro.url != '') {
                                    if(rubro.hasOwnProperty('contracts')) {
                                        rubro['contract_count'] = rubro.contracts.length;
                                        subcat['contract_count'] += rubro.contracts.length;
                                        cat['contract_count'] += rubro.contracts.length;
                                        year['contract_count'] += rubro.contracts.length;
                                        delete rubro.contracts;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Write summary file for the year that was scraped
            if(verbose) {
                console.log('Writing file for year ' + y);
                fs.writeFileSync('./output/' + y + '_summary.json', JSON.stringify(year, null, 4));
            }
        }
    }
}

module.exports = { getCategories, getContracts, saveEntities, getContractDetails }
