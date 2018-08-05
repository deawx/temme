const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const path = require('path')

const pkg = require('./package.json')

const config = {
  context: __dirname,
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[chunkhash:6].bundle.js',
  },

  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },

  module: {
    rules: [
      {
        test: /\.pegjs$/,
        loader: 'pegjs-loader',
      },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },

  plugins: [
    new webpack.DefinePlugin({
      TEMME_VERSION: JSON.stringify(pkg.version),
    }),
    new HtmlWebpackPlugin({
      template: 'index.html',
    }),
  ],

  devServer: {
    contentBase: [path.resolve(__dirname, 'public')],
  },
}

module.exports = config