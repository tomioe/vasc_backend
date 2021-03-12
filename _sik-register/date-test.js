const SIK_OBJECT_FULL = require('./register_over_e_cigaretter_new.json');

const formatString = (inputStr) => {
    const outputString = inputStr.split("-")
    return [outputString[2], outputString[1], outputString[0]]
}

if(SIK_OBJECT_FULL[0]["produkt_mrke_produkt_navn"]) {
    const dateList = SIK_OBJECT_FULL.map( SIK_ENTRY => SIK_ENTRY['indberetningsdato'])
    dateList.sort( (a,b) => {
        // format is in "DD-MM-YYYY"
        // This makes things difficult, so we format it before creating date
        a = formatString(a)
        b = formatString(b)
        var keyA = new Date(a)
        var keyB = new Date(b);
        // Compare the 2 dates
        if (keyA < keyB) return 1;
        if (keyA > keyB) return -1;
        return 0;
    })
    console.log(dateList)
} else {
    console.log(`unable to load SIK register`);
}