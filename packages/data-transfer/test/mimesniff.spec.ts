import {expect} from 'aegir/utils/chai.js';
import {detectContentType} from '../src/mimesniff';
import {Buffer} from 'buffer';

const svgTestData = `
<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-repo-forked">
    <path fill-rule="evenodd" d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"></path>
</svg>
`;

const htmlString = `<h1>Hello</h1>`;

describe('mimesniff', () => {
  it('html', () => {
    const data = Buffer.from(htmlString);
    expect(detectContentType(data)).to.equal('text/html; charset=utf-8');
  });
  it('svg', () => {
    const data = Buffer.from(svgTestData);
    expect(detectContentType(data)).to.equal('image/svg+xml');
  });
});