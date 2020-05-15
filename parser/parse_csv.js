const parse = require('csv-parse/lib/sync')
const fs = require('fs')

const CSV_SIK_PATH_1 = "../store/SIK-register_over_e_cigaretter_new.csv"

const CSV_PATHS = [
    {
        filename: CSV_SIK_PATH_1,
        sikIDCol: "produkt_id",
        prodNameCol: "produkt_mrke_produkt_navn"
    }
]

module.exports = {
    parseSIK: () => {
        let SIKtable = {};
        var parsedCsv = parse(fs.readFileSync(CSV_SIK_PATH_1, 'utf-8'), {
            columns: true,
            skip_empty_lines: true
        });
        
        parsedCsv.forEach(csvLine => {
            const productName = csvLine["produkt_mrke_produkt_navn"].trim();
            const sikID = csvLine["produkt_id"].trim();
            SIKtable[sikID] = productName;
        })
        return SIKtable;
    }
}
