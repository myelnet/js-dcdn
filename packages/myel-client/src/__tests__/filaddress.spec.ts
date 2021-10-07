import {blake2b} from 'blakejs';
import {
  newSecp256k1Address,
  equals,
  newFromString,
  newIDAddress,
} from '../filaddress';

describe('filaddress', () => {
  test('it should create new ID addresses', async () => {
    IDAddresses.forEach((item) => {
      const address = newIDAddress(item.string.slice(2));
      expect(equals(Uint8Array.from(address.str), item.decodedByteArray)).toBe(
        true
      );
    });
  });
  describe('newSecp256k1Address', () => {
    test('it should create new Secp256k1 address', () => {
      const encoder = new TextEncoder();
      const data = encoder.encode('Secp256k1 pubkey');
      const address = newSecp256k1Address(data);
      expect(equals(address.payload(), blake2b(data, undefined, 20))).toBe(
        true
      );
    });

    test('it should create new secp256k1 addresses from string', async () => {
      secp256k1Addresses.forEach((item) => {
        const address = newFromString(item.string);
        expect(
          equals(Uint8Array.from(address.str), item.decodedByteArray)
        ).toBe(true);
      });
    });
  });

  test('it should create new Actor addresses', async () => {
    actorAddresses.forEach((item) => {
      const address = newFromString(item.string);
      expect(equals(Uint8Array.from(address.str), item.decodedByteArray)).toBe(
        true
      );
    });
  });
});

const IDAddresses = [
  {
    string: 't00',
    decodedByteArray: Uint8Array.of(0, 0),
  },
  {
    string: 't01',
    decodedByteArray: Uint8Array.of(0, 1),
  },
  {
    string: 't010',
    decodedByteArray: Uint8Array.of(0, 10),
  },
  {
    string: 't0150',
    decodedByteArray: Uint8Array.of(0, 150, 1),
  },
  {
    string: 't0499',
    decodedByteArray: Uint8Array.of(0, 243, 3),
  },
  {
    string: 't01024',
    decodedByteArray: Uint8Array.of(0, 128, 8),
  },
  {
    string: 't01729',
    decodedByteArray: Uint8Array.of(0, 193, 13),
  },
  {
    string: 't09999999999999999999',
    decodedByteArray: Uint8Array.of(
      0,
      255,
      255,
      159,
      207,
      200,
      224,
      200,
      227,
      138,
      1
    ),
  },
];

const secp256k1Addresses = [
  {
    string: 't15ihq5ibzwki2b4ep2f46avlkrqzhpqgtga7pdrq',
    decodedByteArray: Uint8Array.of(
      1,
      234,
      15,
      14,
      160,
      57,
      178,
      145,
      160,
      240,
      143,
      209,
      121,
      224,
      85,
      106,
      140,
      50,
      119,
      192,
      211
    ),
  },
  {
    string: 't1wbxhu3ypkuo6eyp6hjx6davuelxaxrvwb2kuwva',
    decodedByteArray: Uint8Array.of(
      1,
      176,
      110,
      122,
      111,
      15,
      85,
      29,
      226,
      97,
      254,
      58,
      111,
      225,
      130,
      180,
      34,
      238,
      11,
      198,
      182
    ),
  },
  {
    string: 't1xtwapqc6nh4si2hcwpr3656iotzmlwumogqbuaa',
    decodedByteArray: Uint8Array.of(
      1,
      188,
      236,
      7,
      192,
      94,
      105,
      249,
      36,
      104,
      226,
      179,
      227,
      191,
      119,
      200,
      116,
      242,
      197,
      218,
      140
    ),
  },
  {
    string: 't1xcbgdhkgkwht3hrrnui3jdopeejsoatkzmoltqy',
    decodedByteArray: Uint8Array.of(
      1,
      184,
      130,
      97,
      157,
      70,
      85,
      143,
      61,
      158,
      49,
      109,
      17,
      180,
      141,
      207,
      33,
      19,
      39,
      2,
      106
    ),
  },
  {
    string: 't17uoq6tp427uzv7fztkbsnn64iwotfrristwpryy',
    decodedByteArray: Uint8Array.of(
      1,
      253,
      29,
      15,
      77,
      252,
      215,
      233,
      154,
      252,
      185,
      154,
      131,
      38,
      183,
      220,
      69,
      157,
      50,
      198,
      40
    ),
  },
];

const actorAddresses = [
  {
    string: 't24vg6ut43yw2h2jqydgbg2xq7x6f4kub3bg6as6i',
    decodedByteArray: Uint8Array.of(
      2,
      229,
      77,
      234,
      79,
      155,
      197,
      180,
      125,
      38,
      24,
      25,
      130,
      109,
      94,
      31,
      191,
      139,
      197,
      80,
      59
    ),
  },
  {
    string: 't25nml2cfbljvn4goqtclhifepvfnicv6g7mfmmvq',
    decodedByteArray: Uint8Array.of(
      2,
      235,
      88,
      189,
      8,
      161,
      90,
      106,
      222,
      25,
      208,
      152,
      150,
      116,
      20,
      143,
      169,
      90,
      129,
      87,
      198
    ),
  },
  {
    string: 't2nuqrg7vuysaue2pistjjnt3fadsdzvyuatqtfei',
    decodedByteArray: Uint8Array.of(
      2,
      109,
      33,
      19,
      126,
      180,
      196,
      129,
      66,
      105,
      232,
      148,
      210,
      150,
      207,
      101,
      0,
      228,
      60,
      215,
      20
    ),
  },
  {
    string: 't24dd4ox4c2vpf5vk5wkadgyyn6qtuvgcpxxon64a',
    decodedByteArray: Uint8Array.of(
      2,
      224,
      199,
      199,
      95,
      130,
      213,
      94,
      94,
      213,
      93,
      178,
      128,
      51,
      99,
      13,
      244,
      39,
      74,
      152,
      79
    ),
  },
  {
    string: 't2gfvuyh7v2sx3patm5k23wdzmhyhtmqctasbr23y',
    decodedByteArray: Uint8Array.of(
      2,
      49,
      107,
      76,
      31,
      245,
      212,
      175,
      183,
      130,
      108,
      234,
      181,
      187,
      15,
      44,
      62,
      15,
      54,
      64,
      83
    ),
  },
];
