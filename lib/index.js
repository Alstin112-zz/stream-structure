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
        this.typesDefinitions = {
            "string": ["_: char[2]"],
        };
        this.typeConditions = {};
        this.preProcessing = {
            "string": function (value) {
                if (typeof value !== "string")
                    throw new TypeError("expected a 'string' but got '" + typeof value + "'");
                return { _: value.split("") };
            },
        };
        this.posProcessing = {
            "string": function (value) {
                return value._.join("");
            },
        };
        this.structure = types;
        var err = types.find(function (str) { return !StreamStructure.typeObjectReader.test(str); });
        if (err)
            throw new Error("The string \"" + err + "\" don't match with pattern \"key: type\"");
    }
    StreamStructure.prototype.toBuffer = function (data) {
        var _this = this;
        if (!data)
            throw new TypeError("expected a 'object' as parameter but got '" + null + "'");
        if (typeof data !== "object" && typeof data !== "function")
            throw new TypeError("expected a 'object' as parameter but got '" + null + "'");
        // Lista de Buffers
        var buffers = [];
        /**
         * Pega uma valor com um tipo e envia para o buffer
         * @param type o tipo da data que foi encaminhada
         * @param size a lista em formato de string ex: '[2][1]' | ''
         * @param data o valor para ser passado adiante
         * @param path caminho a ser utilizado caso ocorra algum erro
         */
        var transformVal = function (type, size, data, path) {
            var _a, _b;
            // Caso seja uma lista de objetos
            if (size.length) {
                var _c = StreamStructure.typeArrayBreaker.exec(size), invertEndian = _c[1], indexSize = _c[2], rest = _c[3];
                if (!Array.isArray(data)) {
                    throw new Error("TypeError: expected array (" + type + size + ") got \"" + typeof data + "\": " + path);
                }
                var buff = Buffer.allocUnsafe(+indexSize);
                if ((_this.endian === "BE") === (!invertEndian)) {
                    buff.writeUIntBE(data.length, 0, +indexSize);
                    buffers.push(buff);
                }
                else {
                    buff.writeUIntLE(data.length, 0, +indexSize);
                    buffers.push(buff);
                }
                for (var i = 0; i < data.length; i++) {
                    transformVal(type, rest, data[i], path + "[" + i + "]");
                }
            }
            else {
                var size_1 = 0;
                // Detecta os tipos e manda-os para buffers
                switch (type) {
                    case "boolean": {
                        if (typeof data !== "boolean") {
                            throw new Error("TypeError: expected 'boolean', got '" + typeof data + "': " + path);
                        }
                        var buff = Buffer.allocUnsafe(1);
                        buff.writeInt8(+data);
                        return buffers.push(buff);
                    }
                    case "char": {
                        if (typeof data !== "string") {
                            throw new Error("TypeError: expected 'string', got '" + typeof data + "': " + path);
                        }
                        var buff = Buffer.allocUnsafe(1);
                        buff.write(data);
                        return buffers.push(buff);
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
                            throw new Error("TypeError: expected 'number' or 'bigint', got '" + typeof data + "': " + path);
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
                            throw new Error("The number '" + numb + "' must be in range " + minSize + " ~ " + maxSize + ": " + path);
                        }
                        switch (type) {
                            case "float":
                                buff["writeFloat" + _this.endian](numb);
                                break;
                            case "double":
                                buff["writeDouble" + _this.endian](numb);
                                break;
                            case "byte":
                            case "ubyte":
                                buff["write" + usig + "Int8"](numb);
                                break;
                            case "short":
                            case "ushort":
                                buff["write" + usig + "Int16" + _this.endian](numb);
                                break;
                            case "int":
                            case "uint":
                                buff["write" + usig + "Int32" + _this.endian](numb);
                                break;
                            case "long":
                            case "ulong": {
                                var numb_1 = BigInt(~~data);
                                if (numb_1 < minSize || numb_1 >= maxSize)
                                    throw new Error("The number must be in range " + minSize + " ~ " + maxSize + ": " + path);
                                buff["writeBig" + usig + "Int64" + _this.endian](numb_1);
                                break;
                            }
                        }
                        return buffers.push(buff);
                    }
                }
                //Caso tenha pré-processamento do valor
                if (type in _this.preProcessing)
                    data = _this.preProcessing[type](data);
                if (!(typeof data === "object" || typeof data === "function") || !data)
                    throw new TypeError("expected a 'object' but got '" + typeof data + "': " + path);
                //Caso seja uma outra estrutura
                if (type in _this.typesDefinitions) {
                    for (var _i = 0, _d = _this.typesDefinitions[type]; _i < _d.length; _i++) {
                        var ObjType = _d[_i];
                        var _e = StreamStructure.typeObjectReader.exec(ObjType), key = _e[1], ArrType = _e[2];
                        var _f = StreamStructure.typeReader.exec(ArrType), type_1 = _f[1], size_2 = _f[2];
                        transformVal(type_1, size_2, data[key], path + "." + key);
                    }
                    return;
                }
                //Caso seja uma tipo de condição 
                if (type in _this.typeConditions) {
                    // Data para ser testada
                    var tData = data;
                    if (typeof tData.type !== "string" && typeof tData.type !== "number")
                        throw new TypeError("expected a 'string' or 'number' but got '" + typeof ((_a = data) === null || _a === void 0 ? void 0 : _a.type) + "': " + path + ".type");
                    if (typeof tData.data !== "object" && typeof tData.data !== "function")
                        throw new TypeError("expected a 'object' or 'function' but got '" + typeof ((_b = data) === null || _b === void 0 ? void 0 : _b.type) + "': " + path + ".data");
                    // Data confirmada
                    var cData_1 = data;
                    if (!(cData_1.type in _this.typeConditions[type].data))
                        throw new TypeError("Don't have any condition in '" + type + "' when value is '" + cData_1.type + "'");
                    (function () {
                        var _a = StreamStructure.typeReader.exec(_this.typeConditions[type].indexType), ntype = _a[1], size = _a[2];
                        transformVal(ntype, size, cData_1.type, path + ".key(" + type + ")");
                    })();
                    for (var _g = 0, _h = _this.typeConditions[type].data[cData_1.type]; _g < _h.length; _g++) {
                        var ObjType = _h[_g];
                        var _j = StreamStructure.typeObjectReader.exec(ObjType), key = _j[1], ArrType = _j[2];
                        var _k = StreamStructure.typeReader.exec(ArrType), ntype = _k[1], size_3 = _k[2];
                        transformVal(ntype, size_3, cData_1.data[key], path + "." + key);
                    }
                    return;
                }
                //Caso não seja definido como nenhum desses, é interpretado como erro
                throw new Error("Unknown type \"" + type + "\"");
            }
        };
        // chamar a função;
        for (var _i = 0, _a = this.structure; _i < _a.length; _i++) {
            var ObjType = _a[_i];
            var _b = StreamStructure.typeObjectReader.exec(ObjType), key = _b[1], ArrType = _b[2];
            var _c = StreamStructure.typeReader.exec(ArrType), type = _c[1], size = _c[2];
            transformVal(type, size, data[key], "." + key);
        }
        return Buffer.concat(buffers);
    };
    StreamStructure.prototype.fromBuffer = function (buffer) {
        var _this = this;
        // Index atual do Buffer 
        var index = 0;
        // Valor final 
        var result = {};
        /**
         * Pega o valor do buffer no index atual
         * @param type tipo de propiedade a ser extraida
         * @param endian caso seja BigEndian ou LowEndian
         * @param path caminho para o arquivo atual (debug)
         * @returns valor
         */
        var getValue = function (type, endian, path) {
            try {
                switch (type) {
                    case "boolean":
                        index += 1;
                        return !!buffer.readInt8(index - 1);
                    case "char":
                        index += 1;
                        return buffer.toString("ascii", index - 1, index);
                    case "byte":
                        index += 1;
                        return buffer.readInt8(index - 1);
                    case "ubyte":
                        index += 1;
                        return buffer.readUInt8(index - 1);
                    case "short":
                        index += 2;
                        return buffer["readInt16" + endian](index - 2);
                    case "ushort":
                        index += 2;
                        return buffer["readUInt16" + endian](index - 2);
                    case "int":
                        index += 4;
                        return buffer["readInt32" + endian](index - 4);
                    case "uint":
                        index += 4;
                        return buffer["readUInt32" + endian](index - 4);
                    case "long":
                        index += 8;
                        return buffer["readBigInt64" + endian](index - 8);
                    case "ulong":
                        index += 8;
                        return buffer["readBigUInt64" + endian](index - 8);
                    case "float":
                        index += 4;
                        return buffer["readFloat" + endian](index - 4);
                    case "double":
                        index += 8;
                        return buffer["readDouble" + endian](index - 8);
                }
            }
            catch (err) {
                throw new Error("The Buffer suddenly end when reading the type " + type + ": " + path);
            }
            var data = {};
            if (type in _this.typesDefinitions) {
                _this.typesDefinitions[type].forEach(function (ObjType) {
                    var _a = StreamStructure.typeObjectReader.exec(ObjType), key = _a[1], ArrType = _a[2];
                    var _b = StreamStructure.typeReader.exec(ArrType), type = _b[1], size = _b[2];
                    transformVal(key, type, size, data, path + "." + key);
                });
            }
            else if (type in _this.typeConditions) {
                var index_1 = getValue(_this.typeConditions[type].indexType, _this.endian, path + ".key(" + type + ")");
                if (typeof index_1 !== "string" && typeof index_1 !== "number")
                    throw "expected a 'string' or 'number' but got '" + typeof index_1 + "'";
                _this.typeConditions[type].data[index_1].forEach(function (ObjType) {
                    var _a = StreamStructure.typeObjectReader.exec(ObjType), key = _a[1], ArrType = _a[2];
                    var _b = StreamStructure.typeReader.exec(ArrType), type = _b[1], size = _b[2];
                    transformVal(key, type, size, data, path + "." + key);
                });
                data = { type: index_1, data: data };
            }
            else {
                throw new TypeError("Unknown type \"" + type + "\"");
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
                        arrayLength = buffer.readIntBE(index, +indexSize);
                    }
                    else {
                        arrayLength = buffer.readIntLE(index, +indexSize);
                    }
                }
                catch (err) {
                    throw new Error("The Buffer suddenly end while iterating: " + path);
                }
                index += +indexSize;
                data[key] = [];
                for (var i = 0; i < arrayLength; i++) {
                    data[key][i] = getValue(type, _this.endian, path + "[" + i + "]");
                    ;
                }
            }
            else {
                data[key] = getValue(type, _this.endian, path);
            }
        };
        this.structure.forEach(function (ObjType) {
            var _a = StreamStructure.typeObjectReader.exec(ObjType), key = _a[1], ArrType = _a[2];
            var _b = StreamStructure.typeReader.exec(ArrType), type = _b[1], size = _b[2];
            transformVal(key, type, size, result, "." + key);
        });
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
        this.endian = endian;
        return this;
    };
    StreamStructure.typeObjectReader = /^(\w*)\s*:\s*(\w*\s*(?:\[!?[1-6]\]\s*)*)$/i;
    StreamStructure.typeReader = /^(\w*)\s*((?:\[!?[1-6]\]\s*)*)$/i;
    StreamStructure.typeArrayBreaker = /\[(!?)([1-6])\]((?:\[!?[1-6]\])*)/;
    return StreamStructure;
}());
module.exports = StreamStructure;
//# sourceMappingURL=index.js.map