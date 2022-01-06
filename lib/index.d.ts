/// <reference types="node" />
declare type dictionarystr = `${string}: ${string}`;
declare class StreamStructure {
    structure: dictionarystr[];
    private endian;
    private forcedReturn;
    private typesDefinitions;
    private typeConditions;
    private preProcessing;
    private posProcessing;
    static readonly primitivesLength: Readonly<{
        readonly boolean: 1;
        readonly char: 1;
        readonly string: 2;
        readonly byte: 1;
        readonly ubyte: 1;
        readonly short: 2;
        readonly ushort: 2;
        readonly int: 4;
        readonly uint: 4;
        readonly long: 8;
        readonly ulong: 8;
        readonly float: 4;
        readonly double: 8;
    }>;
    private static readonly typeObjectReader;
    private static readonly typeReader;
    private static readonly typeArrayBreaker;
    /**
     * Create a StreamStructure, must be created using the sequence `key: type`
     *
     * @example //Creating a structure for a simple object `{name: string,age: number}`
     * cosnt SS = new StreamStructure("name: string", "age: byte");
     */
    constructor(...types: dictionarystr[]);
    toBuffer(data: Record<string, unknown>): Buffer;
    fromBuffer(buffer: Buffer): Record<string, unknown>;
    /**
     * Create a Complex type, maded of anothers types.
     *
     * @param type the type that will be created
     * @param structure a sequence of `key: type`
     */
    setType(type: string, ...structure: dictionarystr[]): this;
    /**
     * Create a pre-process and post-process for any type, userful for get a better reading out or input.
     * @param type the type that will be pre-processed and post-processed
     * @param preProcessing the pre-processor used to change this type when storaged in buffer
     * @param postProcessing the pre-processor used to change this type when storaged in buffer
     */
    setTypeProcess(type: string, preProcessing: (value: unknown) => Record<string, unknown>, postProcessing: (value: Record<string, unknown>) => unknown): this;
    setTypeCondicionalIndex(type: string, indexType: string): this;
    setTypeCondicional(type: string, condition: string, structure: dictionarystr[]): this;
    /**
     * Set the default endian for the numbers, arrays, etc.
     * @param endian the default endian
     * @returns
     */
    setDefaultEndian(endian: "BE" | "LE"): this;
    /**
     * Instead of return the error when something goes wrong, will return the Object with error inside (recomended only for debug)
     * @param bool (true by defautk)
     */
    setForcedReturn(bool?: boolean): void;
}
export = StreamStructure;
//# sourceMappingURL=index.d.ts.map