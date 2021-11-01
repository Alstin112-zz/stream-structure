class StreamStructure {

    public structure: string[];

    private endian: "BE" | "LE" = "BE";

    private typesDefinitions: Record<string, string[]> = {
        "string": ["_: char[2]"],
    }

    private typeConditions: Record<string, { indexType: string, data: Record<string, string[]> }> = {
    }

    private preProcessing: Record<string, (value: unknown) => Record<string, unknown>> = {
        "string": (value: unknown): Record<string, string[]> => {
            if (typeof value !== "string") throw new TypeError(`expected a 'string' but got '${typeof value}'`);
            return { _: value.split("") };
        },
    }

    private posProcessing: Record<string, (value: Record<string, unknown>) => unknown> = {
        "string": (value: Record<string, unknown>): string => {
            return (value._ as string[]).join("");
        },
    }

    private static readonly typeObjectReader = /^(\w*)\s*:\s*(\w*\s*(?:\[!?[1-6]\]\s*)*)$/i;
    private static readonly typeReader = /^(\w*)\s*((?:\[!?[1-6]\]\s*)*)$/i;
    private static readonly typeArrayBreaker = /\[(!?)([1-6])\]((?:\[!?[1-6]\])*)/;

    /**
     * Create a StreamStructure, must be created using the sequence `key: type`
     * 
     * @example //Creating a structure for a simple object `{name: string,age: number}`
     * cosnt SS = new StreamStructure("name: string", "age: byte");
     */
    constructor(...types: string[]) {

        this.structure = types;

        const err = types.find(str => !StreamStructure.typeObjectReader.test(str));
        if (err) throw new Error(`The string "${err}" don't match with pattern "key: type"`);

    }

    toBuffer(data: Record<string, unknown>): Buffer {

        if (!data) throw new TypeError(`expected a 'object' as parameter but got '${null}'`);
        if (typeof data !== "object" && typeof data !== "function") throw new TypeError(`expected a 'object' as parameter but got '${null}'`);

        // Lista de Buffers
        let buffers: Buffer[] = [];

        /**
         * Pega uma valor com um tipo e envia para o buffer 
         * @param type o tipo da data que foi encaminhada
         * @param size a lista em formato de string ex: '[2][1]' | ''
         * @param data o valor para ser passado adiante
         * @param path caminho a ser utilizado caso ocorra algum erro
         */
        const transformVal = (type: string, size: string, data: unknown, path: string) => {

            // Caso seja uma lista de objetos
            if (size.length) {

                let [, invertEndian, indexSize, rest] = StreamStructure.typeArrayBreaker.exec(size)!;

                if (!Array.isArray(data)) {
                    throw new Error(`TypeError: expected array (${type}${size}) got "${typeof data}": ${path}`);
                }

                let buff = Buffer.allocUnsafe(+indexSize);

                if ((this.endian === "BE") === (!invertEndian)) {
                    buff.writeUIntBE(data.length, 0, +indexSize);
                    buffers.push(buff);
                } else {
                    buff.writeUIntLE(data.length, 0, +indexSize);
                    buffers.push(buff);
                }

                for (let i = 0; i < data.length; i++) {
                    transformVal(type, rest, data[i], `${path}[${i}]`);
                }

            } else {

                type nntn = (value: number | BigInt, offset?: number) => number;
                let size: number = 0;

                // Detecta os tipos e manda-os para buffers
                switch (type) {
                    case "boolean": {
                        if (typeof data !== "boolean") {
                            throw new Error(`TypeError: expected 'boolean', got '${typeof data}': ${path}`);
                        }
                        let buff = Buffer.allocUnsafe(1);
                        buff.writeInt8(+data);
                        return buffers.push(buff);
                    }
                    case "char": {
                        if (typeof data !== "string") {
                            throw new Error(`TypeError: expected 'string', got '${typeof data}': ${path}`);
                        }
                        let buff = Buffer.allocUnsafe(1);
                        buff.write(data);
                        return buffers.push(buff);
                    }
                    case "byte": case "ubyte": case "short": case "ushort":
                    case "int": case "uint": case "long": case "ulong":
                    case "float": case "double": {
                        if (typeof data !== "number" && typeof data !== "bigint") {
                            throw new Error(`TypeError: expected 'number' or 'bigint', got '${typeof data}': ${path}`);
                        }

                        const numbTypes = [["byte"], ["short"], ["int", "float"], ["long", "double"]]
                        const usig = type.startsWith("u") ? "U" : "";
                        const buffSize = numbTypes.findIndex(n => n.includes(type.replace('u','')));
                        const buff = Buffer.allocUnsafe(1 << buffSize);
                        const maxValue = new Array(buffSize).fill(0).reduce(a => a * a, BigInt(256));
                        const maxSize = maxValue / BigInt(+!usig + 1);
                        const minSize = !usig ? -maxSize : 0 ;

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

                        return buffers.push(buff);
                    }
                }

                //Caso tenha pré-processamento do valor
                if (type in this.preProcessing) data = this.preProcessing[type](data as Record<string, unknown>);

                if (!(typeof data === "object" || typeof data === "function") || !data) throw new TypeError(`expected a 'object' but got '${typeof data}': ${path}`);

                //Caso seja uma outra estrutura
                if (type in this.typesDefinitions) {

                    for (const ObjType of this.typesDefinitions[type]) {
                        const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                        const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                        transformVal(type, size, (data as Record<string, unknown>)[key], `${path}.${key}`);
                    }
                    return;
                }

                //Caso seja uma tipo de condição 
                if (type in this.typeConditions) {

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

                //Caso não seja definido como nenhum desses, é interpretado como erro
                throw new Error(`Unknown type "${type}"`);


            }

        }

        // chamar a função;
        for (const ObjType of this.structure) {
            const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
            const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

            transformVal(type, size, data[key], `.${key}`);
        }

        return Buffer.concat(buffers);
    }

    fromBuffer(buffer: Buffer) {
        // Index atual do Buffer 
        let index = 0;
        // Valor final 
        let result: Record<string, unknown> = {};

        /**
         * Pega o valor do buffer no index atual
         * @param type tipo de propiedade a ser extraida
         * @param endian caso seja BigEndian ou LowEndian
         * @param path caminho para o arquivo atual (debug)
         * @returns valor
         */
        const getValue = (type: string, endian: string, path: string): unknown => {

            type ntn = (offset?: number) => number;

            try {

                switch (type) {
                    case "boolean": index += 1; return !!buffer.readInt8(index - 1);
                    case "char": index += 1; return buffer.toString("ascii", index - 1, index);

                    case "byte": index += 1; return buffer.readInt8(index - 1);
                    case "ubyte": index += 1; return buffer.readUInt8(index - 1);

                    case "short": index += 2; return (buffer[`readInt16${endian}` as keyof Buffer] as ntn)(index - 2);
                    case "ushort": index += 2; return (buffer[`readUInt16${endian}` as keyof Buffer] as ntn)(index - 2);

                    case "int": index += 4; return (buffer[`readInt32${endian}` as keyof Buffer] as ntn)(index - 4);
                    case "uint": index += 4; return (buffer[`readUInt32${endian}` as keyof Buffer] as ntn)(index - 4);

                    case "long": index += 8; return (buffer[`readBigInt64${endian}` as keyof Buffer] as ntn)(index - 8);
                    case "ulong": index += 8; return (buffer[`readBigUInt64${endian}` as keyof Buffer] as ntn)(index - 8);

                    case "float": index += 4; return (buffer[`readFloat${endian}` as keyof Buffer] as ntn)(index - 4);
                    case "double": index += 8; return (buffer[`readDouble${endian}` as keyof Buffer] as ntn)(index - 8);

                }

            } catch (err) {
                throw new Error(`The Buffer suddenly end when reading the type ${type}: ${path}`)
            }

            let data = {}
            if (type in this.typesDefinitions) {
                this.typesDefinitions[type].forEach(ObjType => {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                    transformVal(key, type, size, data, `${path}.${key}`);
                })
            } else if (type in this.typeConditions) {
                const index = getValue(this.typeConditions[type].indexType, this.endian, `${path}.key(${type})`);

                if (typeof index !== "string" && typeof index !== "number") throw `expected a 'string' or 'number' but got '${typeof index}'`;

                this.typeConditions[type].data[index].forEach(ObjType => {
                    const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
                    const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

                    transformVal(key, type, size, data, `${path}.${key}`);
                });
                data = { type: index, data: data };

            } else {
                throw new TypeError(`Unknown type "${type}"`);
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
                        arrayLength = buffer.readIntBE(index, +indexSize);
                    } else {
                        arrayLength = buffer.readIntLE(index, +indexSize);
                    }

                } catch (err) {
                    throw new Error(`The Buffer suddenly end while iterating: ${path}`)
                }
                index += +indexSize;

                (data as Record<string, unknown>)[key] = [];

                for (let i = 0; i < arrayLength; i++) {
                    ((data as Record<string, unknown>)[key] as unknown[])[i] = getValue(type, this.endian, `${path}[${i}]`);;
                }

            } else {

                (data as Record<string, unknown>)[key] = getValue(type, this.endian, path);

            }
        }

        this.structure.forEach((ObjType) => {
            const [, key, ArrType] = StreamStructure.typeObjectReader.exec(ObjType)!;
            const [, type, size] = StreamStructure.typeReader.exec(ArrType)!;

            transformVal(key, type, size, result, `.${key}`);
        })

        return result;
    }

    /**
     * Create a Complex type, maded of anothers types.
     * 
     * @param type the type that will be created
     * @param structure a sequence of `key: type`
     */
    setType(type: string, ...structure: string[]) {
        this.typesDefinitions[type] = structure;
        return this;
    }

    /**
     * Create a pre-process and post-process for any type, userful for get a better reading out or input.
     * @param type the type that will be pre-processed and post-processed
     * @param preProcessing the pre-processor used to change this type when storaged in buffer
     * @param postProcessing the pre-processor used to change this type when storaged in buffer
     */
    setTypeProcess(type: string, preProcessing: (value: unknown) => Record<string, unknown>, postProcessing: (value: Record<string, unknown>) => unknown) {
        this.preProcessing[type] = preProcessing;
        this.posProcessing[type] = postProcessing;
        return this;
    }

    setTypeCondicionalIndex(type: string, indexType: string) {
        if (type in this.typeConditions)
            this.typeConditions[type].indexType = indexType;
        else
            this.typeConditions[type] = { indexType: indexType, data: {} };

        return this;
    }

    setTypeCondicional(type: string, condition: string, structure: string[]) {
        if (!(type in this.typeConditions)) this.setTypeCondicionalIndex(type, "string");

        this.typeConditions[type].data[condition] = structure;

        return this;
    }

    /**
     * Set the default endian for the numbers, arrays, etc.
     * @param endian the default endian
     * @returns 
     */
    setDefaultEndian(endian: "BE" | "LE") {
        this.endian = endian;
        return this;
    }
}

export = StreamStructure;