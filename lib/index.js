"use strict";
var StreamStructure = /** @class */ (function () {
    /**
     * Create a StreamStructure, must be created using the sequence `key: type`
     *
     * @example //Creating a structure for a simple object `{name: string,age: number}`
     * cosnt SS = new StreamStructure("name: string", "age: byte");
     */
    function StreamStructure() {
        var types = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            types[_i] = arguments[_i];
        }
        this.endian = "BE";
        this.forcedReturn = false;
        this.typesDefinitions = {};
        this.typeConditions = {};
        this.preProcessing = {};
        this.posProcessing = {};
        this.structure = types;
        var err = types.find(function (str) { return !StreamStructure.typeObjectReader.test(str); });
        if (err)
            throw new Error("The string \"".concat(err, "\" don't match with pattern \"key: type\""));
    }
    StreamStructure.prototype.toBuffer = function (data) {
        var _this = this;
        if (!data)
            throw new TypeError("expected a 'object' as parameter but got '".concat(null, "'"));
        if (typeof data !== "object" && typeof data !== "function")
            throw new TypeError("expected a 'object' as parameter but got '".concat(null, "'"));
        var outBuffers = [];
        /**
         * Pega uma valor com um tipo e envia para o buffer
         * @param type o tipo da data que foi encaminhada
         * @param size a lista em formato de string ex: '[2][1]' | ''
         * @param data o valor para ser passado adiante
         * @param path caminho a ser utilizado caso ocorra algum erro
         */
        var transformVal = function (type, size, data, path) {
            var _a, _b;
            // If the type is a array
            if (size.length) {
                var _c = StreamStructure.typeArrayBreaker.exec(size), invertEndian = _c[1], indexSize = _c[2], rest = _c[3];
                if (!Array.isArray(data)) {
                    throw new Error("TypeError: expected array (".concat(type).concat(size, ") got \"").concat(typeof data, "\": ").concat(path));
                }
                var buff = Buffer.allocUnsafe(+indexSize);
                if ((_this.endian === "BE") === (!invertEndian)) {
                    buff.writeUIntBE(data.length, 0, +indexSize);
                    outBuffers.push(buff);
                }
                else {
                    buff.writeUIntLE(data.length, 0, +indexSize);
                    outBuffers.push(buff);
                }
                for (var i = 0; i < data.length; i++) {
                    transformVal(type, rest, data[i], "".concat(path, "[").concat(i, "]"));
                }
            }
            else {
                var size_1 = 0;
                // Detect the types and send to the buffers
                switch (type) {
                    case "boolean": {
                        if (typeof data !== "boolean") {
                            throw new Error("TypeError: expected 'boolean', got '".concat(typeof data, "': ").concat(path));
                        }
                        var buff = Buffer.allocUnsafe(1);
                        buff.writeInt8(+data);
                        return outBuffers.push(buff);
                    }
                    case "char": {
                        if (typeof data !== "string") {
                            throw new Error("TypeError: expected 'string', got '".concat(typeof data, "': ").concat(path));
                        }
                        var buff = Buffer.allocUnsafe(1);
                        buff.write(data);
                        return outBuffers.push(buff);
                    }
                    case "string": {
                        if (typeof data !== "string") {
                            throw new Error("TypeError: expected 'string', got '".concat(typeof data, "': ").concat(path));
                        }
                        var buff = Buffer.allocUnsafe(data.length + 2);
                        buff["writeInt16".concat(_this.endian)](data.length);
                        buff.write(data);
                        return outBuffers.push(buff);
                    }
                    case "byte":
                    case "ubyte":
                    case "short":
                    case "ushort":
                    case "int":
                    case "uint":
                    case "long":
                    case "ulong":
                    case "float":
                    case "double": {
                        if (typeof data !== "number" && typeof data !== "bigint") {
                            throw new Error("TypeError: expected 'number' or 'bigint', got '".concat(typeof data, "': ").concat(path));
                        }
                        var numbTypes = [["byte"], ["short"], ["int", "float"], ["long", "double"]];
                        var usig = type.startsWith("u") ? "U" : "";
                        var buffSize = numbTypes.findIndex(function (n) { return n.includes(type.replace('u', '')); });
                        var buff = Buffer.allocUnsafe(1 << buffSize);
                        var maxValue = new Array(buffSize).fill(0).reduce(function (a) { return a * a; }, BigInt(256));
                        var maxSize = maxValue / BigInt(+!usig + 1);
                        var minSize = !usig ? -maxSize : 0;
                        var numb = Number(data);
                        if (['byte', 'ubyte', 'short', 'ushort', 'int', 'uint'].includes(type) && numb < minSize || numb >= maxSize) {
                            throw new Error("The number '".concat(numb, "' must be in range ").concat(minSize, " ~ ").concat(maxSize, ": ").concat(path));
                        }
                        switch (type) {
                            case "float":
                                buff["writeFloat".concat(_this.endian)](numb);
                                break;
                            case "double":
                                buff["writeDouble".concat(_this.endian)](numb);
                                break;
                            case "byte":
                            case "ubyte":
                                buff["write".concat(usig, "Int8")](numb);
                                break;
                            case "short":
                            case "ushort":
                                buff["write".concat(usig, "Int16").concat(_this.endian)](numb);
                                break;
                            case "int":
                            case "uint":
                                buff["write".concat(usig, "Int32").concat(_this.endian)](numb);
                                break;
                            case "long":
                            case "ulong": {
                                var numb_1 = BigInt(~~data);
                                if (numb_1 < minSize || numb_1 >= maxSize)
                                    throw new Error("The number must be in range ".concat(minSize, " ~ ").concat(maxSize, ": ").concat(path));
                                buff["writeBig".concat(usig, "Int64").concat(_this.endian)](numb_1);
                                break;
                            }
                        }
                        return outBuffers.push(buff);
                    }
                }
                //make pre-process if can
                if (type in _this.preProcessing)
                    data = _this.preProcessing[type](data);
                if (!(typeof data === "object" || typeof data === "function") || !data)
                    throw new TypeError("expected a 'object' but got '".concat(typeof data, "': ").concat(path));
                //if is another structure
                if (type in _this.typesDefinitions) {
                    for (var _i = 0, _d = _this.typesDefinitions[type]; _i < _d.length; _i++) {
                        var ObjType = _d[_i];
                        var _e = StreamStructure.typeObjectReader.exec(ObjType), key = _e[1], ArrType = _e[2];
                        var _f = StreamStructure.typeReader.exec(ArrType), type_1 = _f[1], size_2 = _f[2];
                        transformVal(type_1, size_2, data[key], "".concat(path, ".").concat(key));
                    }
                    return;
                }
                //If is a condition 
                if (type in _this.typeConditions) {
                    // Data para ser testada
                    var tData = data;
                    if (typeof tData.type !== "string" && typeof tData.type !== "number")
                        throw new TypeError("expected a 'string' or 'number' but got '".concat(typeof ((_a = data) === null || _a === void 0 ? void 0 : _a.type), "': ").concat(path, ".type"));
                    if (typeof tData.data !== "object" && typeof tData.data !== "function")
                        throw new TypeError("expected a 'object' or 'function' but got '".concat(typeof ((_b = data) === null || _b === void 0 ? void 0 : _b.type), "': ").concat(path, ".data"));
                    // Data confirmada
                    var cData_1 = data;
                    if (!(cData_1.type in _this.typeConditions[type].data))
                        throw new TypeError("Don't have any condition in '".concat(type, "' when value is '").concat(cData_1.type, "'"));
                    (function () {
                        var _a = StreamStructure.typeReader.exec(_this.typeConditions[type].indexType), ntype = _a[1], size = _a[2];
                        transformVal(ntype, size, cData_1.type, "".concat(path, ".key(").concat(type, ")"));
                    })();
                    for (var _g = 0, _h = _this.typeConditions[type].data[cData_1.type]; _g < _h.length; _g++) {
                        var ObjType = _h[_g];
                        var _j = StreamStructure.typeObjectReader.exec(ObjType), key = _j[1], ArrType = _j[2];
                        var _k = StreamStructure.typeReader.exec(ArrType), ntype = _k[1], size_3 = _k[2];
                        transformVal(ntype, size_3, cData_1.data[key], "".concat(path, ".").concat(key));
                    }
                    return;
                }
                //If don't have registred
                throw new Error("Unknown type \"".concat(type, "\""));
            }
        };
        for (var _i = 0, _a = this.structure; _i < _a.length; _i++) {
            var ObjType = _a[_i];
            var _b = StreamStructure.typeObjectReader.exec(ObjType), key = _b[1], ArrType = _b[2];
            var _c = StreamStructure.typeReader.exec(ArrType), type = _c[1], size = _c[2];
            transformVal(type, size, data[key], ".".concat(key));
        }
        return Buffer.concat(outBuffers);
    };
    StreamStructure.prototype.fromBuffer = function (buffer) {
        var _this = this;
        if (!Buffer.isBuffer(buffer))
            throw new Error("The input must be a buffer");
        var bufferIndex = 0;
        var result = {};
        /**
         * Pega o valor do buffer no index atual
         * @param type tipo de propiedade a ser extraida
         * @param endian caso seja BigEndian ou LowEndian
         * @param path caminho para o arquivo atual (debug)
         * @returns valor
         */
        var getValue = function (type, endian, path) {
            var data = {};
            if (type in _this.typesDefinitions) { //
                for (var _i = 0, _a = _this.typesDefinitions[type]; _i < _a.length; _i++) {
                    var ObjType = _a[_i];
                    var _b = StreamStructure.typeObjectReader.exec(ObjType), key = _b[1], ArrType = _b[2];
                    var _c = StreamStructure.typeReader.exec(ArrType), type_2 = _c[1], size = _c[2];
                    transformVal(key, type_2, size, data, "".concat(path, ".").concat(key));
                }
            }
            else if (type in _this.typeConditions) {
                var index = getValue(_this.typeConditions[type].indexType, _this.endian, "".concat(path, ".key(").concat(type, ")"));
                if (typeof index !== "string" && typeof index !== "number")
                    throw new Error("expected a 'string' or 'number' but got '".concat(typeof index, "'"));
                if (!(index in _this.typeConditions[type].data))
                    throw new Error("Don't exist any index '".concat(index, "' at type '").concat(type, "': ").concat(path));
                for (var _d = 0, _e = _this.typeConditions[type].data[index]; _d < _e.length; _d++) {
                    var ObjType = _e[_d];
                    var _f = StreamStructure.typeObjectReader.exec(ObjType), key = _f[1], ArrType = _f[2];
                    var _g = StreamStructure.typeReader.exec(ArrType), type_3 = _g[1], size = _g[2];
                    transformVal(key, type_3, size, data, "".concat(path, ".").concat(key));
                }
                data = { type: index, data: data };
            }
            else {
                if (bufferIndex > buffer.length)
                    throw new Error("The Buffer suddenly end when reading the type ".concat(type, ": ").concat(path));
                try {
                    switch (type) {
                        case "boolean":
                            bufferIndex += 1;
                            return !!buffer.readInt8(bufferIndex - 1);
                        case "char":
                            bufferIndex += 1;
                            return buffer.toString("ascii", bufferIndex - 1, bufferIndex);
                        case "string": {
                            bufferIndex += 2;
                            var size = buffer["readInt16".concat(endian)](bufferIndex - 2);
                            bufferIndex += size;
                            return buffer.toString("ascii", bufferIndex - size, bufferIndex);
                        }
                        case "byte":
                            bufferIndex += 1;
                            return buffer.readInt8(bufferIndex - 1);
                        case "ubyte":
                            bufferIndex += 1;
                            return buffer.readUInt8(bufferIndex - 1);
                        case "short":
                            bufferIndex += 2;
                            return buffer["readInt16".concat(endian)](bufferIndex - 2);
                        case "ushort":
                            bufferIndex += 2;
                            return buffer["readUInt16".concat(endian)](bufferIndex - 2);
                        case "int":
                            bufferIndex += 4;
                            return buffer["readInt32".concat(endian)](bufferIndex - 4);
                        case "uint":
                            bufferIndex += 4;
                            return buffer["readUInt32".concat(endian)](bufferIndex - 4);
                        case "long":
                            bufferIndex += 8;
                            return buffer["readBigInt64".concat(endian)](bufferIndex - 8);
                        case "ulong":
                            bufferIndex += 8;
                            return buffer["readBigUInt64".concat(endian)](bufferIndex - 8);
                        case "float":
                            bufferIndex += 4;
                            return buffer["readFloat".concat(endian)](bufferIndex - 4);
                        case "double":
                            bufferIndex += 8;
                            return buffer["readDouble".concat(endian)](bufferIndex - 8);
                    }
                }
                catch (err) {
                    throw new Error("The Buffer suddenly end when reading the type ".concat(type, ": ").concat(path));
                }
            }
            if (type in _this.posProcessing) {
                return _this.posProcessing[type](data);
            }
            return data;
        };
        var transformVal = function (key, type, size, data, path) {
            if (size) {
                var _a = StreamStructure.typeArrayBreaker.exec(size), invertEndian = _a[1], indexSize = _a[2], rest = _a[3];
                var arrayLength = void 0;
                try {
                    if ((_this.endian === "BE") === (!invertEndian)) {
                        arrayLength = buffer.readIntBE(bufferIndex, +indexSize);
                    }
                    else {
                        arrayLength = buffer.readIntLE(bufferIndex, +indexSize);
                    }
                }
                catch (err) {
                    throw new Error("The Buffer suddenly end while iterating: ".concat(path));
                }
                bufferIndex += +indexSize;
                data[key] = [];
                for (var i = 0; i < arrayLength; i++) {
                    console.log(data, path);
                    try {
                        data[key][i] = getValue(type, _this.endian, "".concat(path, "[").concat(i, "]"));
                        ;
                    }
                    catch (err) {
                        if (!_this.forcedReturn)
                            throw err;
                        data[key][i] = err;
                        throw data;
                    }
                }
            }
            else {
                try {
                    data[key] = getValue(type, _this.endian, path);
                }
                catch (err) {
                    if (!_this.forcedReturn)
                        throw err;
                    data[key] = err;
                    throw data;
                }
            }
        };
        for (var _i = 0, _a = this.structure; _i < _a.length; _i++) {
            var ObjType = _a[_i];
            var _b = StreamStructure.typeObjectReader.exec(ObjType), key = _b[1], ArrType = _b[2];
            var _c = StreamStructure.typeReader.exec(ArrType), type = _c[1], size = _c[2];
            try {
                transformVal(key, type, size, result, ".".concat(key));
                console.log("result", result);
            }
            catch (err) {
                if (!this.forcedReturn)
                    throw err;
                break;
            }
        }
        ;
        return result;
    };
    /**
     * Create a Complex type, maded of anothers types.
     *
     * @param type the type that will be created
     * @param structure a sequence of `key: type`
     */
    StreamStructure.prototype.setType = function (type) {
        var structure = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            structure[_i - 1] = arguments[_i];
        }
        this.typesDefinitions[type] = structure;
        return this;
    };
    /**
     * Create a pre-process and post-process for any type, userful for get a better reading out or input.
     * @param type the type that will be pre-processed and post-processed
     * @param preProcessing the pre-processor used to change this type when storaged in buffer
     * @param postProcessing the pre-processor used to change this type when storaged in buffer
     */
    StreamStructure.prototype.setTypeProcess = function (type, preProcessing, postProcessing) {
        this.preProcessing[type] = preProcessing;
        this.posProcessing[type] = postProcessing;
        return this;
    };
    StreamStructure.prototype.setTypeCondicionalIndex = function (type, indexType) {
        if (type in this.typeConditions)
            this.typeConditions[type].indexType = indexType;
        else
            this.typeConditions[type] = { indexType: indexType, data: {} };
        return this;
    };
    StreamStructure.prototype.setTypeCondicional = function (type, condition, structure) {
        var err = structure.find(function (str) { return !StreamStructure.typeObjectReader.test(str); });
        if (err)
            throw new Error("The structure's string \"".concat(err, "\" don't match with pattern \"key: type\""));
        if (!(type in this.typeConditions))
            this.setTypeCondicionalIndex(type, "string");
        this.typeConditions[type].data[condition] = structure;
        return this;
    };
    /**
     * Set the default endian for the numbers, arrays, etc.
     * @param endian the default endian
     * @returns
     */
    StreamStructure.prototype.setDefaultEndian = function (endian) {
        if (endian !== "BE" && endian !== "LE")
            throw new Error("The endian must be 'BE' or 'LE'");
        this.endian = endian;
        return this;
    };
    /**
     * Instead of return the error when something goes wrong, will return the Object with error inside (recomended only for debug)
     * @param bool (true by defautk)
     */
    StreamStructure.prototype.setForcedReturn = function (bool) {
        if (bool === void 0) { bool = true; }
        this.forcedReturn = !!bool;
    };
    StreamStructure.primitivesLength = Object.freeze({
        "boolean": 1,
        "char": 1,
        "string": 2,
        "byte": 1,
        "ubyte": 1,
        "short": 2,
        "ushort": 2,
        "int": 4,
        "uint": 4,
        "long": 8,
        "ulong": 8,
        "float": 4,
        "double": 8,
    });
    StreamStructure.typeObjectReader = /^(\w*)\s*:\s*(\w*\s*(?:\[!?[1-6]\]\s*)*)$/i;
    StreamStructure.typeReader = /^(\w*)\s*((?:\[!?[1-6]\]\s*)*)$/i;
    StreamStructure.typeArrayBreaker = /\[(!?)([1-6])\]((?:\[!?[1-6]\])*)/;
    return StreamStructure;
}());
module.exports = StreamStructure;
//# sourceMappingURL=index.js.map