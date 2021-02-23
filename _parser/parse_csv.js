const parse = require('csv-parse/lib/sync')
const fs = require('fs')
const path = require('path')

const STORE_BASE = "/dev/vasc/store"

const CSV_SIK_PATH_1 = path.join(STORE_BASE, "/SIK-register_over_e_cigaretter_new.csv")

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
        try {
            var parsedCsv = parse(fs.readFileSync(CSV_SIK_PATH_1, 'utf-8'), {
                columns: true,
                skip_empty_lines: true
            });
            parsedCsv.forEach(csvLine => {
                const productName = csvLine["produkt_mrke_produkt_navn"].trim();
                const sikID = csvLine["produkt_id"].trim();
                SIKtable[sikID] = productName;
            })
        } catch (err) {
            console.error(err)
        }
        return SIKtable;
    }
}
