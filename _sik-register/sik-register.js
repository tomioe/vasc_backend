const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');


const SIK_OBJECT_FULL = require('./register_over_e_cigaretter_new.json');
const SIK_STRUCTURE = {
        sikID: "produkt_id",
        prodName: "produkt_mrke_produkt_navn"
};
let allProductNames;
let productToSIKMap = {};
if(SIK_OBJECT_FULL[0][SIK_STRUCTURE.prodName]) {
    //console.log("loaded sik object");
    allProductNames = SIK_OBJECT_FULL.map( SIK_ENTRY => SIK_ENTRY[SIK_STRUCTURE.prodName])
    SIK_OBJECT_FULL.forEach( (item) => {
        let key = item[SIK_STRUCTURE.prodName];
        productToSIKMap[key] = item[SIK_STRUCTURE.sikID]
    })
} else {
    console.log(`unable to load SIK register`);
}



module.exports = {
    findMatches: (productName, numberOfMatches) => {
        const bestMatches = stringSimilarity.findBestMatch(
                                        productName,
                                        allProductNames
                                        )
        let bestMatchList = this.formatSimilarityObject(bestMatches, productToSIKMap);
        if(numberOfMatches <= 0) {
            console.log("[SIK] Cannot get matches for zero or negative number!");
        } else {
            if(numberOfMatches > bestMatchList.length) {
                console.log("[SIK] More matches requested than found!");
            } else {
                // for some reason we get best match at index 0 and index 1,
                // so we slice one off.
                // we also need to preincrement because of this
                bestMatchList = bestMatchList.slice(1,++numberOfMatches);
            }
        }
        return bestMatchList;
    },
    formatSimilarityObject: (similariyObj, prodSikMap) => {
        // this method takes the output from a "string-similarity" object,
        // sorts it, and uses the passed 'prodSikMap' to add the SIK as well
        if(similariyObj.ratings) {
            let retList = simObj.ratings;
            retList.sort( (a,b) => {
                if (a.rating < b.rating) return 1;
                if (a.rating > b.rating) return -1;
                return 0;
            })
            retList = retList.map( (match) => {
                return {
                    'productName': match.target,
                    'rating': match.rating,
                    'sikID': productToSIKMap[match.target]
                };
            })
            return retList;
        } else {
            console.log(`[SIK] Invalid similarity object.`);
        }
    }
}
