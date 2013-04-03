
/**
 * @param {Array} keys: All keys that are required
 * @param {Function} cb: cb(err,result), result being a map with all requested values
 */ 
function grab(keys, cb) {

    var self = this;

    var result = {
        orig: this
    };

    var keyIndex = 0;
    var key = keys[keyIndex];

    var innerCb = function(err, res) {
        if(err) {
            cb(err, result);
            return;
        }

        result[key] = res;

        keyIndex++;
        if(keyIndex >= keys.length) {
            cb(null, result);
        } else {
            key = keys[keyIndex];
            self[key](innerCb);
        }
    };

    this[key](innerCb);
}

module.exports = grab;