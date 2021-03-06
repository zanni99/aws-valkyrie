'use strict';

const fs = require('fs');
const path = require('path');
const style = fs.readFileSync(path.join(__dirname, '/../templates/style.css'));
const pretty = require('js-object-pretty-print').pretty;

const getContentType = (headers) => (headers['content-type'] || headers['Content-Type']);

const statusColor = (statusCode) => {
  switch (statusCode.toString()[0]) {
    case '2':
      return 'limegreen';
    case '3':
      return 'blue';
    case '4':
      return 'orange';
    case '5':
      return 'red';
    default:
      return 'black';
  }
};

module.exports.htmlFormatter = (data) => {
  const { request, response } = data;
  const html = [`
    <script>console.log(\`${pretty(data)}\`);</script>
    <style>${style}</style>
    <div class="container">
    <h1>Request</h1>
    <table>
      <col style="width: 10vw" />
      <col style="width: 50vw" />
    `];

  Object.entries(request).forEach(([key, value]) => {
    if (value) html.push(`<tr>
      <th>${key}</th>
      <td ${typeof value === 'object' ? 'class="jsonViewerReq"' : ''}>${typeof value === 'object' ? pretty(value, 2) : value}</td>
    </tr>`);
  });

  html.push(`</table>
    <h1>Response</h1>
    <table class="parent-table" style="text-align: left;">
    <col style="width: 10vw" />
    <col style="width: 25vw" />
    <col style="width: 25vw" />
    <tr><th>Key</th><th>Express</th><th>Valkyrie</th></tr>`);

  Object.entries(response.express).forEach(([key, value]) => {
    const valueValkyrie = response.valkyrie[key];
    if(value || valueValkyrie) {
      html.push(`<tr><th>${key}</th>`);
    }
    if (value) {
      html.push(`
        <td ${typeof value === 'object' ? 'class="jsonViewerRes"' : ''}`);
      if (key === 'statusCode') html.push (` style="color: ${statusColor(value)}"`);
      if (key === 'headers' || (key === 'body' &&
        getContentType(response.express.headers) && getContentType(response.express.headers).includes('application/json'))) {
        html.push(`>${typeof value === 'object' ? pretty(value, 2) : pretty(JSON.parse(value), 2)}`);
      } else {
        html.push(`>${value}`);
      }
      html.push('</td>');
    }
    if (valueValkyrie) {
      html.push(`
        <td ${typeof valueValkyrie === 'object' ? 'class="jsonViewerRes"' : ''}`);
      if (key === 'statusCode') html.push(` style="color: ${statusColor(valueValkyrie)}"`);
      if (key === 'headers' || (key === 'body' &&
        getContentType(response.valkyrie.headers) && getContentType(response.valkyrie.headers).includes('application/json'))) {
        html.push(`>${typeof valueValkyrie === 'object' ? pretty(valueValkyrie, 2) : pretty(JSON.parse(valueValkyrie), 2)}`);
      } else {
        html.push(`>${valueValkyrie}`);
      }
      html.push('</td>');
    }
    if(value || valueValkyrie) {
      html.push('</tr>');
    }
  });


  html.push('</table></div>');

  return html.join('');
};
