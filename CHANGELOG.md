# Changelog

## [1.2.0](https://github.com/elpamplina/mastodon-threading/compare/1.1.2...1.2.0)

### New features

* Mastodon quote support:
** Option to convert links into quotes if possible.
** Option to set own posts quote policy. 
* Unified "send single post" and "send thread" in an unique command "send to Mastodon".
* Better control of rate limits using the x-ratelimit-remaining HTTP header.
* Using granular scopes to limit the permissions granted to the app. Credentials are checked everytime before posting.
* Send selected fragment now supports media attachments and content warnings.

### Technical

* Upgraded to TypeScript 5 and other libraries and dependencies.

## [1.1.2](https://github.com/elpamplina/mastodon-threading/compare/1.1.1...1.1.2)

### New features

* Error messages more informative.

## [1.1.1](https://github.com/elpamplina/mastodon-threading/compare/1.1.0...1.1.1)

### Bug fixes

* Fixed "file not found" when attachment folder were configured by relative notation.

## [1.1.0](https://github.com/elpamplina/mastodon-threading/compare/1.0.9...1.1.0)

### New features

* Now you can establish the language code that will be sent to the Mastodon server. This meets the protocol so that the posts are better handled by apps.
* Better control of the types of attachments to prevent the media being rejected by the server.
* Control of the number of requests to respect the posts limit established by the server. This prevents long threads being rejected.
* Better server availability detection.

## [1.0.9](https://github.com/elpamplina/mastodon-threading/compare/1.0.8...1.0.9)

### Bug fixes

* Fix credential encryption.
* Fix wrong video size limit.

> You MAY need to log in again in your server to get new credentials after this update is applied.

## [1.0.8](https://github.com/elpamplina/mastodon-threading/compare/1.0.7...1.0.8)

### Languages

* German translation, thanks to [platypusgit](https://github.com/platypusgit).

### Bug fixes

* Fix broken credential encryption when using foreign charsets.

> You MAY need to log in again in your server to get new credentials after this update is applied.

## [1.0.7](https://github.com/elpamplina/mastodon-threading/releases/tag/1.0.7)

First release on Obsidian repository.
