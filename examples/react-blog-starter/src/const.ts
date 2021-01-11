import FrogsCover from './assets/frogcover.jpeg';
import NeuronsCover from './assets/neurons.jpeg';

const placeholder = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Praesent elementum facilisis leo vel fringilla est ullamcorper eget. At imperdiet dui accumsan sit amet nulla facilities morbi tempus. Praesent elementum facilisis leo vel fringilla. Congue mauris rhoncus aenean vel. Egestas sed tempus urna et pharetra pharetra massa massa ultricies.

Venenatis cras sed felis eget velit. Consectetur libero id faucibus nisl tincidunt. Gravida in fermentum et sollicitudin ac orci phasellus egestas tellus. Volutpat consequat mauris nunc congue nisi vitae. Id aliquet risus feugiat in ante metus dictum at tempor. Sed blandit libero volutpat sed cras. Sed odio morbi quis commodo odio aenean sed adipiscing. Velit euismod in pellentesque massa placerat. Mi bibendum neque egestas congue quisque egestas diam in arcu. Nisi lacus sed viverra tellus in. Nibh cras pulvinar mattis nunc sed. Luctus accumsan tortor posuere ac ut consequat semper viverra. Fringilla ut morbi tincidunt augue interdum velit euismod.

## Lorem Ipsum

Tristique senectus et netus et malesuada fames ac turpis. Ridiculous mus mauris vitae ultricies leo integer malesuada nunc vel. In mollis nunc sed id semper. Egestas tellus rutrum tellus pellentesque. Phasellus vestibulum lorem sed risus ultricies tristique nulla. Quis blandit turpis cursus in hac habitasse platea dictumst quisque. Eros donec ac odio tempor orci dapibus ultrices. Aliquam sem et tortor consequat id porta nibh. Adipiscing elit duis tristique sollicitudin nibh sit amet commodo nulla. Diam vulputate ut pharetra sit amet. Ut tellus elementum sagittis vitae et leo. Arcu non odio euismod lacinia at quis risus sed vulputate.
    `;

export const posts = [
  {
    title: 'Myel: A Community Powered Content Delivery Network',
    coverImage:
      // 'http://localhost:5420/ipfs/bafykbzaceaydeik6i5etcqormkid2sn7bxo3wknnj4psa2s7cfip2yhvbcu24/Project/shipping-container.jpeg',
      FrogsCover,
    excerpt:
      'Learn more about Myel, a community powered content delivery network, as I guide you through hosting a simple blog on Myel.',
    date: '2021-01-07T05:35:07.322Z',
    author: {
      name: 'T. Chardin',
      picture: '/tchardin.png',
    },
    slug: 'intro',
    content: `
When I first started developing with IPFS back in 2017, I was fascinated with all the use cases it would enable but what got me most excited was the ability to build applications without ever needing a server. Sure, data ownership, censorship resistance and content addressing was neat but at the time I couldn't afford remote server costs and had to max out Heroku's free tier to serve my apps so having a protocol to serve file and content directly from users' devices was revolutionary.

It took me quite some time to wrap my head around the distributed state paradigm as opposed to the client server model I was used to. I was most surprised to find out when I would "add" data to IPFS, it wasn't actually uploaded and replicated across the network. For that to happen required other nodes to be interested in that same data, fetch it from my node and pin it to their local store. So when I added my cool app's source files to IPFS, and my laptop was off my users couldn't access it.

To solve this we had to host an IPFS node on a server and accessing content through its http gateway. To me it defied the purpose of using IPFS and so I kept serving my apps on Heroku.

Fast forward to 2021 and we have Filecoin, a blockchain protocol to pay remote peers directly to store your IPFS blocks. The Filecoin protocols offer a bunch of proofs to guarantee a peer will store and make data available during the duration of an agreed upon contract. To compute these proofs, becoming a storage provider on the Filecoin network requires powerful hardware and substantial storage capacity. Although it considerably lowers the barrier to entry for new cloud storage businesses, one cannot provide storage with their regular PCs.

In fact, Filecoin storage is an incredible solution for archiving and cold storing but what happens if a large amount of people want to access the same content around the world?
    
At the time of this writing:
- To retrieve content from Filecoin a client must know the network identity of the storage peers.
- A client can only retrieve content from storage providers part of the related storage deal.
- Filecoin storage providers need to store a duplicate copy of content  so they can serve it faster without unsealing a sector.
- One must run a Filecoin lotus node to retrieve content.

In the Filecoin whitepaper, Juan Benet et al envisioned a secondary market where some peers could temporarily store content to let other peers retrieve it faster. This sparked my original excitement for IPFS and so with my partners in crime, Alex and Sandra we decided to build the hot storage and retrieval layer for Filecoin.

Application developers are building incredible new digital experiences. These new applications such as VR games, immersive video streaming and rich content publishing platforms require flexible and powerful content delivery tools like never before. Our mission at Myel is to help developers bring and scale performant new experiences to the entire world without relying on expensive server side infrastructures.

While there are many sophisticated use cases we will enable over time, we'd like to show a simple example our first version of the Myel retrieval system can handle: this simple blog.

As we develop Myel we'd like to publish notes and insights about our progress. The content can be formatted as a bunch of markdown files, images and maybe audio and video product demos. Further, we'd like to write the blog UI once and easily publish new posts without touching the code. To do this we've built 3 components:

### The Hop Exchange

An IPFS exchange interface like Bitswap which uses a lightweight gossipsub implementation to ask other nodes in the network if they have the requested blocks. Peers that have the blocks stream a response back with retrieval deal terms they support and the exchange starts a payment channel, connects to a remote lotus RPC and sends a FIL transaction to retrieve the blocks.

On Start, the exchange subscribes to a GossipSub topic to receive cids about new content uploaded to Filecoin. If they have available space (configurable), the exchange will automatically retrieve the content from the publishing client (Without any FIL charge).

The Hop exchange wraps Bitswap so if a bitswap request yields no result it will call the hop exchange to try retrieving the content from a Filecoin retrieval provider. Further, it will soon be available as an IPFS plugin making it easy for anyone to turn their IPFS node into a retrieval provider node and earn FIL to temporarily store content.

### The Myel Desktop App

A MacOS desktop app allows developers and retrieval providers to run and manage a Myel node. The app is a native Swift app featuring a simple file browser and wallet interface and spawning a go daemon running in the background to store and serve content to the network. By default it interacts with a lotus node on Infura but one can run their own lotus node if they wish to do so.

Myel nodes run the Hop Exchange so they implement the same features with an added intuitive user interface for visual feedback of the market and retrieval earnings. On top of this, it features an onramp banking connection UI to easily add FIL to the wallet.

To upload files to Filecoin, one can create a new directory and add files to it. Once they're ready to store it, they get an estimated deal price based on the connected peers and can start a deal. This will automatically upload the content for storage on Filecoin and propagate the content to other peers for fast retrieval.

Technically one could use this app to store any files they desire on Filecoin however we aren't optimizing the app so the functionality will remain very rudimentary.

### The Myel js client

A modern lightweight javascript library allows web applications to load content from a local Myel node via http. If a Myel node is not running the library will prompt to start or install the app.

Optional react hooks can also be installed to load and cache content in modern React apps.

Getting back to our blog, since IPFS is not supported in most browsers yet we need to point our blog domain to a gateway to resolve our source code. In addition, we upload our content directory to Filecoin and propagate it across the Myel network.

When the blog source code loads in our readers' browser it checks if a local Myel node is running if it's not the case it falls back to a temporary placeholder at the developer's discretion. We still decided to leave this article on IPFS for easier access but we encourage you to try the Myel app and retrieve the content with testnet FIL.

Most of the source code can be cached in a service worker, so no more requests to the gateway will be necessary if you are running a local Myel node. As we add more articles, we publish them under an IPNS so we can easily query the latest root hash for all our content. 

### Next steps

We are still testing on the Filecoin Calibration net and will be releasing to mainnet soon. There is a large body of work involved in optimizing how to route and replicate content across the Myel network and to that end we are applying for a Filecoin grant to support our effort.

In the meantime you can [sign up](https://www.myel.network/#/sign-up) to try it out or if you have any feedback you can open an issue directly on the [repo](https://github.com/myelnet/go-hop-exchange).

Thanks for reading!
    `,
  },
  {
    title: 'Optimal Content Allocation on the Myel network',
    coverImage: NeuronsCover,
    excerpt:
      'With an infinite influx of content and limited amount of storage, Myel nodes must decide how to best allocate and replicate content with their peers. Here we introduce the content distribution system behind the Myel network.',
    date: '2020-01-09T05:35:07.322Z',
    author: {
      name: 'A. Camuto',
      picture: '/alex.png',
    },
    slug: 'optimize',
    content: `
Our previous post covered the reasons we're building Myel. We're building a new app development paradigm where your users and your community act as your infrastructure. You can focus on building a great user experience and don't need to waste time on scaling out your infrastructure, on ensuring your servers and code are interoperable with your content delivery network (CDNs), or on micro-managing your cloud costs. 

Your users 'host' your app for you, and as more users use your app, your infrastructure scales automatically. They're your backend servers, your content delivery points of presence, and your customers all wrapped in one. 

To surpass the performance of existing centralized CDNs, the Myel network requires lots of peers to join it. The more peers there are, the more we can duplicate content across the world and serve it rapidly to your users. But, we also need to take into account new challenges that centralized CDNs do not face. 

### What Challenges ?

In a centralized model, you pay a CDN provider a fixed monthly rate and they will allocate your content to a few of their points of presence. Therse are typically in large cities like London or New York, from which they cache and serve your content. There are not a ton of places to choose from, and picking where to allocate content is relatively straight-forward. If your user base is mainly French, then caching content within a CDN's Paris point of presence makes the most sense. 

In the Myel world, the network points of presence are dynamic. They can turn on and off at a whim. Someone can shut their laptop for the night or their wifi can go down. 

To counter this phenomenon we have a few tricks up our sleeve. The first is that peers get paid every minute they have a Myel node running. The more content they cache for applications and other users the more Filecoin they receive. This should incentivize users to keep their laptops on for longer periods of time. 

Nevertheless we can't guarantee constant up-time for each peer. So our second mechanism is to duplicate content across points of presence; enforcing redundancy and resilience. Your content is cached across multiple users' hardrives, so that if one user goes offline, another still has that content ready to go. 

### Smart Content Allocation

But we can't blindly duplicate content across every user in the network. We need to be smart about it. If most of your users are in Japan, we should prioritize allocating your content to peers there, so that they can quickly deliver it to other users. 

Enforcing this is simple, if someone visits your website they automatically become a point of presence for your content. That way your points of presence automatically reflect the demographics of your user base, as your users __are your points of presence__ ! 

But lets say your starting a new project, and you don't have a lot of users just yet but you want CDN-like performance and maximum up-time from the get-go. 

To achieve this we'll always ensure Myel peers have some free hard-drive space to onboard new applications to the network. We distribute your content to peers that have a good 'reputation' first. These are peers that have been online consistently and have good hardware so they can deliver content quickly. 

At first we distribute your content across the globe, and with maximum redundancy, as you might not know where your future user base lies ! As more and more users start requesting your content, becoming peers themselves, we start to collect statistics on who, what and where your content is going. If your users are mainly in Japan, we'll ensure redundancy  beyond your user-base by allocating your content to high-reputation Myel users in Japan. This way you have a solid and reliable base-load of points of presence close to your users.  

When you push new content, we'll prioritize allocating it to this reliable baseload first, as we know it'll be close to your existing user-base. 

Because your content is allocated organically in this way, we bring content closer to your users than existing CDNs ever could. We make content delivery as fast and efficient as it ever could possibly be.   

[Sign up](https://www.myel.network/#/sign-up) to try it out or feel free to open an issue directly on the [repo](https://github.com/myelnet/go-hop-exchange) if you have any feedback.

    `,
  },
  // {
  //   title: 'Onboarding humans to the web 3.0',
  //   coverImage:
  //     'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixid=MXwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=3481&q=80',
  //   excerpt:
  //     'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Praesent elementum facilisis leo vel fringilla est ullamcorper eget. At imperdiet dui accumsan sit amet nulla facilities morbi tempus.',
  //   date: '2020-03-16T05:35:07.322Z',
  //   author: {
  //     name: 'S. Platano',
  //     picture: '/sandra.jpeg',
  //   },
  //   slug: 'users',
  //   content: content,
  // },
];
