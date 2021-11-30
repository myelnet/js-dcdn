import {CID, bytes} from 'multiformats';
import {ContentRouting} from '../routing';

const record = bytes.fromHex(
  '845833047f00000106a221dd03a503260024080112209c242e980fb24f18e0e7c7906bdf411eb1d441443413671be9ed4b90d1e37bbb5501480aeb60993d198e8457a22f83ac0ac06e4257a41a059be11bf6'
);

describe('routing', () => {
  const loader = {
    getRecords: jest.fn(),
  };
  loader.getRecords.mockReturnValue(
    (async function* () {
      yield record;
    })()
  );
  test('caches offers', async () => {
    const cid = CID.parse(
      'bafyreia26sn74b5zgaigvy2ata7i5qp2yxnkfdzwf5kmm6acrirwpsmwfu'
    );
    const routing = new ContentRouting({loader});

    for (let i = 0; i < 3; i++) {
      const offers = routing.findProviders(cid)[Symbol.asyncIterator]();
      const {value, done} = await offers.next();

      expect(value).toMatchObject({cid});

      expect(loader.getRecords.mock.calls.length).toBe(1);

      const next = await offers.next();
      expect(next.done).toBe(true);
    }
  });
});
