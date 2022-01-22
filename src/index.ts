type dictionarystr = `${string}: ${string}`;
interface stringtotype {
    string: string;
    number: number;
    boolean: boolean;
    bigint: bigint;
    object: object;
    undefined: undefined;
    symbol: symbol;
    function: Function;
}
function isProperty<K extends string, V extends (keyof stringtotype)[]>(key: K, inObject: object, ...valueType: V): inObject is typeof inObject & {[_ in K]: V["length"] extends 0 ? unknown : stringtotype[V[number]]} {
    return key in inObject && (!valueType.length || valueType.includes(typeof (inObject as {[_ in K]: unknown})[key]));
};
function assertIsNotProperty<K extends string, V extends (keyof stringtotype)[]>(key: K, inObject: object, path: string, ...valueType: V): asserts inObject is typeof inObject & {[_ in K]: V["length"] extends 0 ? unknown : stringtotype[V[number]]} {
    const exists = key in inObject;
    const propertyType = typeof (inObject as {[_ in K]: unknown})[key];
    const testTypes = !!valueType.length;

    if(!exists || testTypes && !valueType.includes(propertyType)) {
        if(!testTypes) {
            throw new TypeError(`expected some value but got ${propertyType}: ${path}.${key}`);
        }
        
        const expectedTypes = valueType.map(v=>`'${v}'`).reduce((c,t,i) => i === 0 ? t : i === 1 ? t + " or " : t + ", ","");
        throw new TypeError(`expected ${expectedTypes} but got ${propertyType}: ${path}.${key}`);
    }
    
};
//throw new TypeError(`expected 'object' or 'function' but got '${typeof (inObject as {data: unknown}).data}': ${path}.data`);

function assertNotObject(data: any, path: string): asserts data is Record<string, unknown> {
    if (!data || (typeof data !== "object" && typeof data !== "function")) {
        throw new TypeError(`expected 'object' but got '${typeof data}': ${path}`);
    }
}

class StreamStructure {

    public structure: dictionarystr[];

    private endian: "BE" | "LE" = "BE";

    private typesDefinitions: Record<string, dictionarystr[]> = {}
    private typeConditions: Record<string, { indexType: string, data: Record<string | number | symbol, dictionarystr[]> }> = {}
    private preProcessing: Record<string, (value: unknown) => unknown> = {}
    private posProcessing: Record<string, (value: unknown) => unknown> = {}

    public static readonly primitivesLength = Object.freeze({
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
    } as const);

    /** Picks the value from `(key): (value[size])` */
    private static readonly typeObjectReader = /^(\w*)\s*:\s*(\w*\s*(?:\[!?[1-6]\]\s*)*)$/i;
    /** Picks the value from `(value)([size])` */
    private static readonly typeReader = /^(\w*)\s*((?:\[!?[1-6]\]\s*)*)$/i;
    /** Breaks the array size from `[(!)(size1)]([size2][size3])` */
    private static readonly typeArrayBreaker = /\[(!?)([1-6])\]((?:\[!?[1-6]\])*)/;

    /**
     * Create a StreamStructure, must be created using the sequence `key: type`
     * 
     * @example //Creating a structure for a simple object `{name: string,age: number}`
     * cosnt SS = new StreamStructure("name: string", "age: byte");
     */
    constructor(...types: dictionarystr[]) {

        this.structure = types;

        const err = types.find(str => !StreamStructure.typeObjectReader.test(str));
        if (err) throw new Error(`The string "${err}" don't match with pattern "key: type"`);

    }

    toBuffer(data: Record<string, unknown>): Buffer {

        assertNotObject(data,"");

        let outBuffers: Buffer[] = [];

        /**
         * Pega uma valor com um tipo e envia para o buffer 
         * @param type o tipo da data que foi encaminhada
         * @param size a lista em formato de string ex: '[2][1]' | ''
         * @param data o valor para ser passado adiante
         * @param path caminho a ser utilizado caso ocorra algum erro
         */
        const transformVal = (type: string, size: string, data: unknown, path: string) => {

            // If the type is a array
            if (size.length) {
                
                if (!Array.isArray(data)) {
                    throw new TypeError(`Expected array (${type}${size}) but got "${typeof data}": ${path}`);
                }

                const [, invertEndian, indexSize, rest] = StreamStructure.typeArrayBreaker.exec(size)!;
                const buff = Buffer.allocUnsafe(+indexSize);

                if ((this.endian === "BE") === (!invertEndian)) {
                    buff.writeUIntBE(data.length, 0, +indexSize);
                    outBuffers.push(buff);
                } else {
                    buff.writeUIntLE(data.length, 0, +indexSize);
                    outBuffers.push(buff);
                }

                for (let i = 0; i < data.length; i++) {
                    transformVal(type, rest, data[i], `${path}[${i}]`);
                }

                return;
            }

            //make pre-process if can
            if (type in this.preProcessing) data = this.preProcessing[type](data);

            //if is another structure
            if (type in this.typesDefinitions) {
                assertNotObject(data, path);

                for (const ObjType of this.typesDefinitions[type]) {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                    transformVal(type, size, data[key], `${path}.${key}`);
                }
                return;
            }

            //If is a condition 
            if (type in this.typeConditions) {

                // Detect wrong inputs
                assertNotObject(data, path);
                assertIsNotProperty("type",data,path,"string","number");
                assertIsNotProperty("data",data,path,"object","function");                

                // detect if input exist
                if (!(data.type in this.typeConditions[type].data)) throw new TypeError(`Don't have any condition in '${type}' when value is '${data.type}'`);

                (() => {
                    const [, ntype, size] = StreamStructure.typeReader.exec(this.typeConditions[type].indexType)!;
                    transformVal(ntype, size, data.type, `${path}.key(${type})`);
                })();

                for (const ObjType of this.typeConditions[type].data[data.type]) {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, ntype, size] = StreamStructure.typeReader.exec(ArrType)!;
                    transformVal(ntype, size, (data.data as Record<string, unknown>)[key], `${path}.${key}`);
                }
                return;
            }

            // Detect the types and send to the buffers
            switch (type) {
                case "boolean": {
                    if (typeof data !== "boolean")
                        throw new TypeError(`Expected 'boolean', got '${typeof data}': ${path}`);
                    let buff = Buffer.allocUnsafe(1);
                    buff.writeInt8(+data);
                    return outBuffers.push(buff);
                }
                case "char": {
                    if (typeof data !== "string")
                        throw new TypeError(`Expected 'string', got '${typeof data}': ${path}`);
                    let buff = Buffer.allocUnsafe(1);
                    buff.write(data);
                    return outBuffers.push(buff);
                }
                case "string": {
                    if (typeof data !== "string")
                        throw new TypeError(`expected 'string', got '${typeof data}': ${path}`);
                    let buff = Buffer.allocUnsafe(data.length + 2);
                    buff[`writeInt16${this.endian}`](data.length);
                    buff.write(data, 2);
                    return outBuffers.push(buff);
                }
                case "byte": case "ubyte": case "short": case "ushort":
                case "int": case "uint": case "long": case "ulong":
                case "float": case "double": {
                    if (typeof data !== "number" && typeof data !== "bigint") {
                        throw new TypeError(`Expected 'number' or 'bigint', got '${typeof data}': ${path}`);
                    }

                    const numbTypes = [["byte"], ["short"], ["int", "float"], ["long", "double"]]
                    const usig = type.startsWith("u") ? "U" : "";
                    const buffSize = numbTypes.findIndex(n => n.includes(type.replace('u', '')));
                    const buff = Buffer.allocUnsafe(1 << buffSize);
                    const maxValue = new Array(buffSize).fill(0).reduce(a => a * a, BigInt(256));
                    const maxSize = maxValue / BigInt(+!usig + 1);
                    const minSize = !usig ? -maxSize : 0;

                    const numb = Number(data);
                    if (['byte', 'ubyte', 'short', 'ushort', 'int', 'uint'].includes(type) && numb < minSize || numb >= maxSize) {
                        throw new RangeError(`The number '${numb}' must be in range ${minSize} ~ ${maxSize}: ${path}`);
                    }

                    switch (type) {
                        case "float": buff[`writeFloat${this.endian}`](numb); break;
                        case "double": buff[`writeDouble${this.endian}`](numb); break;
                        case "byte": case "ubyte": buff[`write${usig}Int8`](numb); break;
                        case "short": case "ushort": buff[`write${usig}Int16${this.endian}`](numb); break;
                        case "int": case "uint": buff[`write${usig}Int32${this.endian}`](numb); break;
                        case "long": case "ulong": {
                            const numb = BigInt(~~data);
                            if (numb < minSize || numb >= maxSize)
                                throw new RangeError(`The number must be in range ${minSize} ~ ${maxSize}: ${path}`);

                            buff[`writeBig${usig}Int64${this.endian}`](numb);
                            break;
                        }
                    }

                    return outBuffers.push(buff);
                }
            }

            //If don't have registred
            throw new TypeError(`Unknown type "${type}"`);
        }

        for (const ObjType of this.structure) {
            const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
            const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

            transformVal(type, size, data[key], `.${key}`);
        }

        return Buffer.concat(outBuffers);
    }

    fromBuffer(buffer: Buffer): Record<string, unknown> {

        if (!Buffer.isBuffer(buffer)) throw new TypeError(`The input must be a buffer`);

        let bufferIndex = 0;
        let result: Record<string, unknown> = {};

        /**
         * Picks the buffer value at actual index
         * @param type Type of property to be extracted
         * @param endian in case of been BigEndian or LowEndian
         * @param path path to actual variable (debug)
         * @returns value
         */
        const getValue = (type: string, endian: "BE" | "LE", path: string): unknown => {

            type ntn = (offset?: number) => number;

            let data = {}
            if (type in this.typesDefinitions) { //

                for (const ObjType of this.typesDefinitions[type]) {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                    transformVal(key, type, size, data, `${path}.${key}`);
                }

            } else if (type in this.typeConditions) {
                const index = getValue(this.typeConditions[type].indexType, this.endian, `${path}.key(${type})`);

                if (typeof index !== "string" && typeof index !== "number") throw new TypeError(`expected a 'string' or 'number' but got '${typeof index}'`);
                if (!(index in this.typeConditions[type].data)) throw new TypeError(`Don't exist any index '${index}' at type '${type}': ${path}`)

                for (const ObjType of this.typeConditions[type].data[index]) {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                    transformVal(key, type, size, data, `${path}.${key}`);
                }

                data = { type: index, data: data };
            } else {
                if (bufferIndex > buffer.length) throw new RangeError(`The Buffer suddenly end when reading the type '${type}': ${path}`);
                try {
                    switch (type) {
                        case "boolean": bufferIndex += 1; return !!buffer.readInt8(bufferIndex - 1);
                        case "char": bufferIndex += 1; return buffer.toString("ascii", bufferIndex - 1, bufferIndex);
                        case "string": {
                            bufferIndex += 2;
                            const size = buffer[`readInt16${endian}`](bufferIndex - 2);
                            bufferIndex += size;
                            return buffer.toString("ascii", bufferIndex - size, bufferIndex)
                        }

                        case "byte": bufferIndex += 1; return buffer.readInt8(bufferIndex - 1);
                        case "ubyte": bufferIndex += 1; return buffer.readUInt8(bufferIndex - 1);

                        case "short": bufferIndex += 2; return buffer[`readInt16${endian}`](bufferIndex - 2);
                        case "ushort": bufferIndex += 2; return buffer[`readUInt16${endian}`](bufferIndex - 2);

                        case "int": bufferIndex += 4; return (buffer[`readInt32${endian}`] as ntn)(bufferIndex - 4);
                        case "uint": bufferIndex += 4; return (buffer[`readUInt32${endian}`] as ntn)(bufferIndex - 4);

                        case "long": bufferIndex += 8; return (buffer[`readBigInt64${endian}` as keyof Buffer] as ntn)(bufferIndex - 8);
                        case "ulong": bufferIndex += 8; return (buffer[`readBigUInt64${endian}` as keyof Buffer] as ntn)(bufferIndex - 8);

                        case "float": bufferIndex += 4; return (buffer[`readFloat${endian}` as keyof Buffer] as ntn)(bufferIndex - 4);
                        case "double": bufferIndex += 8; return (buffer[`readDouble${endian}` as keyof Buffer] as ntn)(bufferIndex - 8);

                    }

                } catch (err) {
                    throw new RangeError(`The Buffer suddenly end when reading the type ${type}: ${path}`);
                }

            }

            if (type in this.posProcessing) {
                return this.posProcessing[type](data);
            }

            return data;
        }

        /**
         * Picks 'type' from the buffer and add to the 'data' in property 'key'
         * @param key field to be inserted in 'data'
         * @param type type to be extracted from buffer
         * @param size if is a array, and tell your size. ex: '[2][6]'
         * @param data object to be added
         * @param path path to actual variable (debug)
         */
        const transformVal = (key: string, type: string, size: string, data: Record<string, unknown>, path: string): void => {

            if (size) {
                const [, invertEndian, indexSize, rest] = StreamStructure.typeArrayBreaker.exec(size)!;
                const indexEndian = (this.endian === "BE") === (!invertEndian) ? "BE" : "LE";

                let arrayLength: number;
                try {
                    arrayLength = buffer[`readInt${indexEndian}`](bufferIndex, +indexSize);
                } catch (err) {
                    throw new RangeError(`The Buffer suddenly end while iterating: ${path}`)
                }
                bufferIndex += +indexSize;

                data[key] = [];

                for (let i = 0; i < arrayLength; i++) {
                    (data as Record<string, unknown[]>)[key][i] = getValue(type, this.endian, `${path}[${i}]`);;
                }

                return;
            }
            data[key] = getValue(type, this.endian, path);
        }

        for (const ObjType of this.structure) {
            const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
            const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

            transformVal(key, type, size, result, `.${key}`);
        }

        return result;
    }

    /**
     * Creates a Complex type, maded of anothers types.
     * 
     * @param type the type that will be created
     * @param structure a sequence of `key: type`
     */
    setType(type: string, ...structure: dictionarystr[]): this {

        if (typeof type !== "string") throw new TypeError(`The type must be string`);
        const err = structure.find(str => !StreamStructure.typeObjectReader.test(str));
        if (err) throw new Error(`The string '${err}' don't match with pattern 'key: type'`);

        this.typesDefinitions[type] = structure;
        return this;
    }

    /**
     * Creates a pre-process and post-process for any type, userful for get a better reading out or input.
     * @param type the type that will be pre-processed and post-processed
     * @param preProcessing the pre-processor used to change this type when storaged in buffer
     * @param postProcessing the pre-processor used to change this type when storaged in buffer
     */
    setTypeProcess<A, B>(type: string, preProcessing: (value: A) => B, postProcessing: (value: B) => A): this {
        if (typeof type !== "string") throw new TypeError(`The type must be string`);
        if (typeof preProcessing !== "function") throw new TypeError(`The preProcessing must be function`);
        if (typeof postProcessing !== "function") throw new TypeError(`The postProcessing must be function`);

        this.preProcessing[type] = preProcessing as (value: unknown) => unknown;
        this.posProcessing[type] = postProcessing as (value: unknown) => unknown;
        return this;
    }

    /**
     * Sets the type of key from a typeConditional, normally used only with "string" or "byte".
     * @param type 
     * @param indexType 
     * @returns 
     */
    setTypeConditionalIndex(type: string, indexType: string): this {

        if (typeof type !== "string") throw new TypeError(`The type must be string`);
        if (typeof indexType !== "string") throw new TypeError(`The indexType must be string`);

        if (type in this.typeConditions)
            this.typeConditions[type].indexType = indexType;
        else
            this.typeConditions[type] = { indexType: indexType, data: {} };

        return this;
    }

    /**
     * Creates a type that changes the structure based on the key setted before, usefull for recursive objects
     * @param type the type to be created
     * @param condition if the key is equal to this argument, will use this structure
     * @param structure structure to be used
     */
    setTypeConditional(type: string, condition: string | number | symbol, ...structure: dictionarystr[]): this {

        if (typeof type !== "string") throw new TypeError(`The type must be string`);
        if (!["string", "number", "symbol"].includes(typeof condition)) throw new TypeError(`The type must be string or number`);

        const err = structure.find(str => !StreamStructure.typeObjectReader.test(str));
        if (err) throw new Error(`The string '${err}' don't match with pattern 'key: type'`);

        if (!(type in this.typeConditions)) this.setTypeConditionalIndex(type, "string");
        this.typeConditions[type].data[condition] = structure;

        return this;
    }

    /**
     * @deprecated mismatch :P, instead use the `SS.setTypeConditionalIndex()`
     */
    setTypeCondicionalIndex(type: string, indexType: string) {
        if (type in this.typeConditions)
            this.typeConditions[type].indexType = indexType;
        else
            this.typeConditions[type] = { indexType: indexType, data: {} };

        return this;
    }

    /**
     * @deprecated mismatch :P, instead use the `SS.setTypeConditional()`
     */
    setTypeCondicional(type: string, condition: string, structure: dictionarystr[]) {

        const err = structure.find(str => !StreamStructure.typeObjectReader.test(str));
        if (err) throw new Error(`The structure's string "${err}" don't match with pattern "key: type"`);

        if (!(type in this.typeConditions)) this.setTypeConditionalIndex(type, "string");

        this.typeConditions[type].data[condition] = structure;

        return this;
    }

    /**
     * Set the default endian for the numbers, arrays, etc.
     * @param endian the default endian
     * @returns 
     */
    setDefaultEndian(endian: "BE" | "LE") {
        if (endian !== "BE" && endian !== "LE") throw new Error("The endian must be 'BE' or 'LE'");

        this.endian = endian;
        return this;
    }
}

export = StreamStructure;