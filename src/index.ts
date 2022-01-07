type dictionarystr = `${string}: ${string}`;

class StreamStructure {

    public structure: dictionarystr[];

    private endian: "BE" | "LE" = "BE";
    private forcedReturn: boolean = false;

    private typesDefinitions: Record<string, dictionarystr[]> = {}
    private typeConditions: Record<string, { indexType: string, data: Record<string, dictionarystr[]> }> = {}
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

    private static readonly typeObjectReader = /^(\w*)\s*:\s*(\w*\s*(?:\[!?[1-6]\]\s*)*)$/i;
    private static readonly typeReader = /^(\w*)\s*((?:\[!?[1-6]\]\s*)*)$/i;
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

        if (!data) throw new TypeError(`expected a 'object' as parameter but got '${null}'`);
        if (typeof data !== "object" && typeof data !== "function") throw new TypeError(`expected a 'object' as parameter but got '${null}'`);

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

                let [, invertEndian, indexSize, rest] = StreamStructure.typeArrayBreaker.exec(size)!;

                if (!Array.isArray(data)) {
                    throw new Error(`TypeError: expected array (${type}${size}) got "${typeof data}": ${path}`);
                }

                let buff = Buffer.allocUnsafe(+indexSize);

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

            } else {
                type nntn = (value: number | BigInt, offset?: number) => number;
                let size: number = 0;

                //make pre-process if can
                if (type in this.preProcessing) data = this.preProcessing[type](data);

                //if is another structure
                if (type in this.typesDefinitions) {
                    if (!(typeof data === "object" || typeof data === "function") || !data) throw new TypeError(`expected a 'object' but got '${typeof data}': ${path}`);

                    for (const ObjType of this.typesDefinitions[type]) {
                        const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                        const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                        transformVal(type, size, (data as Record<string, unknown>)[key], `${path}.${key}`);
                    }
                    return;
                }

                //If is a condition 
                if (type in this.typeConditions) {
                    if (!(typeof data === "object" || typeof data === "function") || !data) throw new TypeError(`expected a 'object' but got '${typeof data}': ${path}`);

                    // Data para ser testada
                    const tData = data as { type?: unknown, data?: unknown };

                    if (typeof tData.type !== "string" && typeof tData.type !== "number") throw new TypeError(`expected a 'string' or 'number' but got '${typeof (data as { type?: unknown, data?: unknown })?.type}': ${path}.type`);
                    if (typeof tData.data !== "object" && typeof tData.data !== "function") throw new TypeError(`expected a 'object' or 'function' but got '${typeof (data as { type?: unknown, data?: unknown })?.type}': ${path}.data`);

                    // Data confirmada
                    const cData = data as { type: string | number, data: object | (() => void) };

                    if (!(cData.type in this.typeConditions[type].data)) throw new TypeError(`Don't have any condition in '${type}' when value is '${cData.type}'`);

                    (() => {
                        const [, ntype, size] = StreamStructure.typeReader.exec(this.typeConditions[type].indexType)!;

                        transformVal(ntype, size, cData.type, `${path}.key(${type})`);
                    })();


                    for (const ObjType of this.typeConditions[type].data[cData.type]) {
                        const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                        const [, ntype, size] = StreamStructure.typeReader.exec(ArrType)!;

                        transformVal(ntype, size, (cData.data as Record<string, unknown>)[key], `${path}.${key}`);
                    }
                    return;
                }

                // Detect the types and send to the buffers
                switch (type) {
                    case "boolean": {
                        if (typeof data !== "boolean") {
                            throw new Error(`TypeError: expected 'boolean', got '${typeof data}': ${path}`);
                        }
                        let buff = Buffer.allocUnsafe(1);
                        buff.writeInt8(+data);
                        return outBuffers.push(buff);
                    }
                    case "char": {
                        if (typeof data !== "string") {
                            throw new Error(`TypeError: expected 'string', got '${typeof data}': ${path}`);
                        }
                        let buff = Buffer.allocUnsafe(1);
                        buff.write(data);
                        return outBuffers.push(buff);
                    }
                    case "string": {
                        if (typeof data !== "string") {
                            throw new Error(`TypeError: expected 'string', got '${typeof data}': ${path}`);
                        }
                        let buff = Buffer.allocUnsafe(data.length + 2);
                        buff[`writeInt16${this.endian}`](data.length);
                        buff.write(data, 2);
                        return outBuffers.push(buff);
                    }
                    case "byte": case "ubyte": case "short": case "ushort":
                    case "int": case "uint": case "long": case "ulong":
                    case "float": case "double": {
                        if (typeof data !== "number" && typeof data !== "bigint") {
                            throw new Error(`TypeError: expected 'number' or 'bigint', got '${typeof data}': ${path}`);
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
                            throw new Error(`The number '${numb}' must be in range ${minSize} ~ ${maxSize}: ${path}`);
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
                                    throw new Error(`The number must be in range ${minSize} ~ ${maxSize}: ${path}`);

                                buff[`writeBig${usig}Int64${this.endian}`](numb);
                                break;
                            }
                        }

                        return outBuffers.push(buff);
                    }
                }


                //If don't have registred
                throw new Error(`Unknown type "${type}"`);


            }

        }

        for (const ObjType of this.structure) {
            const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
            const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

            transformVal(type, size, data[key], `.${key}`);
        }

        return Buffer.concat(outBuffers);
    }

    fromBuffer(buffer: Buffer): Record<string, unknown> {

        if (!Buffer.isBuffer(buffer)) throw new Error(`The input must be a buffer`);

        let bufferIndex = 0;
        let result: Record<string, unknown> = {};

        /**
         * Pega o valor do buffer no index atual
         * @param type tipo de propiedade a ser extraida
         * @param endian caso seja BigEndian ou LowEndian
         * @param path caminho para o arquivo atual (debug)
         * @returns valor
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

                if (typeof index !== "string" && typeof index !== "number") throw new Error(`expected a 'string' or 'number' but got '${typeof index}'`);
                if (!(index in this.typeConditions[type].data)) throw new Error(`Don't exist any index '${index}' at type '${type}': ${path}`)

                for (const ObjType of this.typeConditions[type].data[index]) {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                    transformVal(key, type, size, data, `${path}.${key}`);
                }

                data = { type: index, data: data };
            } else {
                if (bufferIndex > buffer.length) throw new Error(`The Buffer suddenly end when reading the type '${type}': ${path}`);
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
                    throw new Error(`The Buffer suddenly end when reading the type ${type}: ${path}`);
                }

            }

            if (type in this.posProcessing) {
                return this.posProcessing[type](data);
            }

            return data;
        }

        let transformVal = (key: string, type: string, size: string, data: unknown, path: string) => {

            if (size) {
                const [, invertEndian, indexSize, rest] = StreamStructure.typeArrayBreaker.exec(size)!;

                let arrayLength: number;

                try {

                    if ((this.endian === "BE") === (!invertEndian)) {
                        arrayLength = buffer.readIntBE(bufferIndex, +indexSize);
                    } else {
                        arrayLength = buffer.readIntLE(bufferIndex, +indexSize);
                    }

                } catch (err) {
                    throw new Error(`The Buffer suddenly end while iterating: ${path}`)
                }
                bufferIndex += +indexSize;

                (data as Record<string, unknown>)[key] = [];

                for (let i = 0; i < arrayLength; i++) {
                    (data as Record<string, unknown[]>)[key][i] = getValue(type, this.endian, `${path}[${i}]`);;
                }

            } else {

                (data as Record<string, unknown>)[key] = getValue(type, this.endian, path);

            }
        }

        for (const ObjType of this.structure) {
            const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
            const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

            transformVal(key, type, size, result, `.${key}`);
        }

        return result;
    }

    /**
     * Create a Complex type, maded of anothers types.
     * 
     * @param type the type that will be created
     * @param structure a sequence of `key: type`
     */
    setType(type: string, ...structure: dictionarystr[]) {
        this.typesDefinitions[type] = structure;
        return this;
    }

    /**
     * Create a pre-process and post-process for any type, userful for get a better reading out or input.
     * @param type the type that will be pre-processed and post-processed
     * @param preProcessing the pre-processor used to change this type when storaged in buffer
     * @param postProcessing the pre-processor used to change this type when storaged in buffer
     */
    setTypeProcess<A, B>(type: string, preProcessing: (value: A) => B, postProcessing: (value: B) => A) {
        this.preProcessing[type] = preProcessing as (value: unknown) => unknown;
        this.posProcessing[type] = postProcessing as (value: unknown) => unknown;
        return this;
    }

    setTypeConditionalIndex(type: string, indexType: string) {
        if (type in this.typeConditions)
            this.typeConditions[type].indexType = indexType;
        else
            this.typeConditions[type] = { indexType: indexType, data: {} };

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

    
    setTypeConditional(type: string, condition: string, structure: dictionarystr[]) {

        const err = structure.find(str => !StreamStructure.typeObjectReader.test(str));
        if (err) throw new Error(`The structure's string "${err}" don't match with pattern "key: type"`);

        if (!(type in this.typeConditions)) this.setTypeConditionalIndex(type, "string");

        this.typeConditions[type].data[condition] = structure;

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

    /**
     * Instead of return the error when something goes wrong, will return the Object with error inside (recomended only for debug)
     * @param bool (true by defautk)
     */
    setForcedReturn(bool: boolean = true) {
        this.forcedReturn = !!bool;
    }
}

export = StreamStructure;