# Table of Contents

- [Table of Contents](#table-of-contents)
- [Installation](#installation)
- [Basics](#basics)
  - [Using](#using)
  - [Types Table](#types-table)
  - [Arrays](#arrays)
- [Methods](#methods)
  - [toBuffer()](#tobuffer)
  - [fromBuffer()](#frombuffer)
  - [setType()](#settype)
  - [setTypeProcess()](#settypeprocess)
  - [setDefaultEndian()](#setdefaultendian)
  - [setTypeCondicional()](#settypecondicional)
  - [setTypeCondicionalIndex()](#settypecondicionalindex)

# Installation

```bash
$ npm i streamstructure
```

# Basics

This npm is about parsing objects into Buffers, useful to exporting data and import again later.
This creates a structure capable of reducing the space needed at least at possible. 

## Using

To transform a simple Object with properties `name` and `color` in a buffer, just use on the constructor the keys and the type of these keys.

> ```js
> const SS = require('streamstructure');
> 
> const personModel = new SS("name: string","color: string");
> const person = {
>    name: "viktor",
>    color: "yellow"
> }
> 
> const buff = personModel.toBuffer(person); 
> console.log(buff); // expected output <Buffer 00 06 76 69 6b 74 6f 72 00 06 79 65 6c 6c 6f 77>
> 
> const outPerson = personModel.fromBuffer(buff); 
> console.log(outPerson); // expected output {name: "viktor", color: "yellow"}
> ```

We can use anothers types beyond `string`.

## Types Table

| type    | input   | bytes | comment                                                |
| ------- | ------- | :---: | ------------------------------------------------------ |
| byte    | number  |   1   | range `-128` ~ `127`                                   |
| ubyte   | number  |   1   | range `0` ~ `255`                                      |
| short   | number  |   2   | range `-32513` ~ `32767`                               |
| ushort  | number  |   2   | range `0` ~ `65535`                                    |
| int     | number  |   4   | range `0` ~ `4294967295`                               |
| uint    | number  |   4   | range `-2147483648` ~ `2147483647`                     |
| long    | number  |   8   | range `-9223372036854775808n` ~ `9223372036854775807n` |
| ulong   | number  |   8   | range `0n` ~ `18446744073709551615n`                   |
| float   | number  |   4   |                                                        |
| double  | number  |   8   | normal number from js                                  |
| char    | string  |   1   | just a single letter                                   |
| boolean | boolean |   1   | true or false                                          |
| string  | string  |  n+2  | string where `n` is the string length                  |

## Arrays

It's possible to transform the types into array of types, just using `[n]` as suffix where `n` is size of index, must be used any number in range `1-6`
```js
const birthdaysModel = new SS("birthdays: short[2]");
const birthdays = {
    birthdays: [3103,2212,2307],
}

console.log(birthdaysModel.toBuffer(birthdays)); // expected output <Buffer 00 03 0c 1f 08 a4 09 03>
```

You can invert the index [endianess](https://en.wikipedia.org/wiki/Endianness) by using `!` before the number.


```js
const birthdaysModel = new SS("birthdays: short[!4]");
const birthdays = {
    birthdays: [3103,2212,2307],
}

console.log(birthdaysModel.toBuffer(birthdays)); // expected output <Buffer 03 00 00 00 0c 1f 08 a4 09 03>
```

# Methods

## toBuffer()

> ```ts
> toBuffer(data: Record<string, unknown>): Buffer;
> ```

This method can pick json (`data`) and transform into buffer using the presetted structure.

## fromBuffer()

> ```ts
> fromBuffer(buffer: string): Record<string, unknown>;
> ```

This method parses the output buffer from `toBuffer()` into the json.

## setType()

> ```ts
> setType(type: string, ...structure: string[]): this;
> ```
for a more complex json, this function is very useful, this can make objects inside of anothers object.

```js
const houseModel = new SS("rooms: byte", "rented: boolean", "father: person","mother: person","son: person")
    .setType("person", "name: string", "age: byte");

const house = {
    rooms: 8,
    rented: false,
    mother: {
        name: "Rose",
        age: 28
    },
    father: {
        name: "Luccas",
        age: 30
    },
    son: {
        name: "Leo",
        age: 8
    }
}

console.log(houseModel.toBuffer(house)) // expected <Buffer 08 00 00 06 4c 75 63 63 61 73 1e 00 04 52 6f 73 65 1c 00 03 4c 65 6f 08>
```

## setTypeProcess()

> ```ts
> setTypeProcess(
>     type: string,
>     preProcessing: (value: unknown) => Record<string, unknown>,
>     postProcessing: (value: Record<string, unknown>) => unknown
> ): this;
> ```

This method processes the all values of the type `type`.

THe `preProcessing` is used in the `toBuffer()`.  
and the `postProcessing` is used in the `fromBuffer()`.

```js
const sceneModel = new SS("balls: pos[1]")
    .setType("pos", "x: short", "y: short")
    .setTypeProcess(
        "pos",
        (arr) => ({x: arr[0],y: arr[1]}),
        (obj) => [obj.x,obj.y]
    );

const scene = {
    balls: [
        [3,5],
        [-15n,-24n],
        [7.4,-5.3],
        [9000,Math.PI]
    ]
}

const buff = sceneModel.toBuffer(scene);
console.log(buff) // expected <Buffer 04 00 03 00 05 ff f1 ff e8 00 07 ff fb 23 28 00 03>

const outScene = sceneModel.fromBuffer(buff); 
console.log(outScene); // { balls: [ [ 3, 5 ], [ -15, -24 ], [ 7, -5 ], [ 9000, 3 ] ] }
```

## setDefaultEndian()

> ```ts
> setDefaultEndian(endian: "BE" | "LE"): this;
> ```

This method changes the default endianess from arrays and numbers.

*using the inversion (`!`) on the [arrays](#arrays), invert the actual endian*

## setTypeCondicional()

>```ts
>setTypeCondicional(type: string, condition: string, structure: string[]): this;
>```

This Method has a complex behavior, considering `data` of the type  `type`, if the `data.type` is equal to the `condition`, the `data.data` structure will be equal to `strucuture`, if the sent data don't have any `condition`, will return a error.

```js
const ShapesModel = new SS("shapes: shapes[1]")
    .setTypeCondicional("shapes", "circle", ["x: int", "y: int", "radius: int"])
    .setTypeCondicional("shapes", "square", ["x: int", "y: int", "width: int", "height: int"])
    .setTypeCondicional("shapes", "poligon", ["x: int", "y: int", "radius: int", "sides: byte"]);

const Shapes1 = {
    shapes: [
        { type: "circle", data: { x: 2, y: 8, radius: 4 } },
        { type: "poligon", data: { x: 3, y: -3, radius: 20, sides: 8 } },
        { type: "square", data: { x: -6, y: 5, width: 10, height: 10 } },
        { type: "circle", data: { x: 0, y: 0, radius: 40 } },
    ]
}

const buff = ShapesModel.toBuffer(Shapes1); // output buffer
const Shapes2 = ShapesModel.fromBuffer(buff); // identical to object "Shapes1"
```

## setTypeCondicionalIndex()

>```ts
>setTypeCondicionalIndex(type: string, indexType: string): this;
>```

This method sets the way of saving the index on the buffer, the recommended indexType is `string`, `byte` or any other type of number, this can handle anothers type, but only with [preProcessing](#settypeprocess), because the input of the array can only accepts `number` or `string`.

```js
const ShapesModel = new SS("shapes: shapes[1]")
    .setTypeCondicionalIndex("shapes", "byte")
    .setTypeCondicional("shapes", 0, ["x: byte", "y: byte", "radius: byte"])
    .setTypeCondicional("shapes", 1, ["x: byte", "y: byte", "width: byte", "height: byte"])
    .setTypeCondicional("shapes", 2, ["x: byte", "y: byte", "radius: byte", "sides: byte"]);

const Shapes1 = {
    shapes: [
        { type: 0, data: { x: 2, y: 8, radius: 4 } },
        { type: 2, data: { x: 3, y: -3, radius: 20, sides: 8 } },
        { type: 1, data: { x: -6, y: 5, width: 10, height: 10 } },
        { type: 0, data: { x: 0, y: 0, radius: 40 } },
    ]
}

const buff = ShapesModel.toBuffer(Shapes1); // expected <Buffer 04 00 02 08 04 02 03 fd 14 08 01 fa 05 0a 0a 00 00 00 28>
const Shapes2 = ShapesModel.fromBuffer(buff); // identical to object "Shapes1"
```