module.exports = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/pop/getting-started',
        permanent: true,
      },
      {
        source: '/pop',
        destination: '/pop/getting-started',
        permanent: true,
      },
      {
        source: '/myel-js',
        destination: '/myel-js/getting-started',
        permanent: true,
      },
    ];
  },
};
