import {useState, useEffect, useMemo} from 'react';

export type Peer = {
  id: string;
  name: string;
  latency?: number;
  location?: string;
};

type UsePeersParams = {
  ping: boolean;
};

type UsePeersResult = {
  peers: Peer[];
  selectedPeers: Peer[];
  selectPeer: (id: string) => void;
  selected: {[key: string]: boolean};
  importPeer: (addr: string) => void;
};

export function peerAddr(p: Peer): string {
  return '/dns4/' + p.name + '/tcp/443/wss/p2p/' + p.id;
}

export function validateAddr(addr: string): string {
  const parts = addr.split('/');
  if (parts[1] !== 'dns4') {
    return 'multi address should contain dns name';
  }
  if (parts[3] !== 'tcp') {
    return 'multi address should contain tcp protocol';
  }
  if (parts[4] !== '443') {
    return 'multi address should use port 443';
  }
  if (parts[5] !== 'wss') {
    return 'multi address should use websocket secure';
  }
  if (parts[6] !== 'p2p') {
    return 'multi address should be a p2p address';
  }
  if (!parts[7]) {
    return 'multi address should contain peer id';
  }
  return '';
}

const defaultPeers = [
  {
    id: '12D3KooWStJfAywQmfaVFQDQYr9riDnEFG3VJ3qDGcTidvc4nQtc',
    name: 'ohio.myel.zone',
    location: 'Ohio, US',
  },
  {
    id: '12D3KooWPQTuoHCKQJKNsfJqMbiGn7Ms1RLmqSqVmSVipcmYptrf',
    name: 'simparis.myel.zone',
    location: 'Paris, FR',
  },
  {
    id: '12D3KooWJBZ6peowSj8GExHKqZKEBdNtBbz8AFp6YSnBCpLfJVoo',
    name: 'antibes.myel.zone',
    location: 'Antibes, FR',
  },
  {
    id: '12D3KooWLLPFQHmEiF8Qc9XN54P3o7XBkxyL4ucq2p3ruG92J4zr',
    name: 'colenyc.ngrok.io',
    location: 'Brooklyn, US',
  },
  {
    id: '12D3KooWRP3W5Tj5ZbJrN7dkNcmFFjm5sJNeWE1aHZnwkR6HJXCt',
    name: 'karinmia.ngrok.io',
    location: 'Miami, US',
  },
  {
    id: '12D3KooWNzT13Ngk6EZjMZ9eHZxd3mG8Gcbfwbb9bGUS6ugBFo6q',
    name: 'stefanbos.ngrok.io',
    location: 'Boston, US',
  },
  {
    id: '12D3KooWMZf1rQLwmQ1Wp28xHNuLwc6Zh6tG87bq8uU35wELKbUb',
    name: 'willsf.ngrok.io',
    location: 'San Francisco, US',
  },
  {
    id: '12D3KooWLaJQ7L6Q3VWxNNxqE8Tcj2wAq1QAvdBieSteAxg9KTCr',
    name: 'frankfurt.myel.zone',
    location: 'Frankfurt, DE',
  },
  {
    id: '12D3KooWQrFmYVFZPctyJ8kobjJg5AGgZHXB8CiuKCiWeseLcdbm',
    name: 'london.myel.zone',
    location: 'London, UK',
  },
  {
    id: '12D3KooWJFHXFRPEuHwZ2jFdtFEccc1DNbaffKgu6nwBGVZVhQn5',
    name: 'verona.eu.ngrok.io',
    location: 'Verona, IT',
  },
];

export function usePeers(
  {ping}: UsePeersParams = {ping: true}
): UsePeersResult {
  const [peers, setPeers] = useState<Peer[]>(defaultPeers);
  const [selected, setSelected] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (ping) {
      Promise.all(
        peers.map(async (p) => {
          const start = new Date().getTime();
          const calcTime = () => {
            const end = new Date().getTime();
            return {
              ...p,
              latency: (end - start) / 1000,
            };
          };
          // fail a handshake to test latency
          try {
            await fetch('https://' + p.name, {
              headers: {
                Accept: 'text/html',
              },
            });
            return calcTime();
          } catch (e) {
            return calcTime();
          }
        })
      ).then((pwl) => {
        // sort by smallest latency
        const sorted = pwl.sort((pa, pb) => pa.latency - pb.latency);
        // select the first 4 by default
        const first4 = sorted
          .slice(0, 4)
          .reduce((sel, p) => ({...sel, [p.id]: true}), {});
        setPeers(sorted);
        setSelected(first4);
      });
    } else {
      setSelected(
        peers.slice(0, 3).reduce((sel, p) => ({...sel, [p.id]: true}), {})
      );
    }
  }, []);

  const selectPeer = (id: string) => {
    setSelected({...selected, [id]: !selected[id]});
  };

  const selectedPeers = useMemo(
    () => peers.filter((p) => selected[p.id]),
    [peers, selected]
  );

  const importPeer = (addr: string) => {
    if (!!validateAddr(addr)) {
      throw new Error('invalid p2p address');
    }
    const parts = addr.split('/');
    setPeers(
      peers.concat([
        {
          id: parts[7],
          name: parts[2],
          location: parts[2].split('.')[0],
        },
      ])
    );
  };

  return {peers, selectPeer, selected, selectedPeers, importPeer};
}
