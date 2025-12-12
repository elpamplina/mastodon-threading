import {
	addIcon,
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	requestUrl,
	Setting,
	TFile
} from 'obsidian';
import {createApp, getAuthToken, getAuthURL, getClient} from "./auth";
import {mastodon} from "masto";
import * as masto_languages from 'lang/mastodon-languages.json';
import * as lang_en from 'lang/en.json';
import * as lang_es from 'lang/es.json';
import * as lang_de from 'lang/de.json';
import {
	pattern_image,
	pattern_quote,
	pattern_server,
	pattern_md_link,
	pattern_url,
	pattern_warning,
	SEPARATOR,
	separatorField,
	separatorPostProcessor
} from "./utils";
import mime from "mime/lite";
import {decryptText, encryptText, generateKey} from "./encrypt";
import {QuoteApprovalPolicy} from "masto/dist/esm/mastodon/rest/v1/statuses";
import {StatusVisibility} from "masto/dist/cjs/mastodon/entities/v1";

// @ts-ignore
const t = i18next.getFixedT(null, 'plugin-mastodon-threading', null);

interface MastodonThreadingSettings {
	server: string,
	clientId: string,
	clientSecret: string,
	authToken: string,
	maxPost: number,
	serverMaxPost: number,
	serverMaxImage: number,
	serverMaxVideo: number,
	serverMaxAttachments: number,
	serverMaxDescription: number,
	serverMimeTypes: string[],
	serverSupportsQuotes: boolean,
	visibilityFirst: mastodon.v1.StatusVisibility,
	visibilityRest: mastodon.v1.StatusVisibility,
	quoteApproval: QuoteApprovalPolicy | 'default',
	quoteLinks: boolean,
	postCounter: boolean,
	defaultLanguage: string,
}

const DEFAULT_SETTINGS: MastodonThreadingSettings = {
	server: '',
	clientId: '',
	clientSecret: '',
	authToken: '',
	maxPost: 500,
	serverMaxPost: 500,
	serverMaxImage: 10485760,
	serverMaxVideo: 103809024,
	serverMaxAttachments: 4,
	serverMaxDescription: 1500,
	serverMimeTypes: [
		"image/jpeg",
        "image/png",
        "image/gif",
        "image/heic",
        "image/heif",
        "image/webp",
	],
	serverSupportsQuotes: true,
	visibilityFirst: 'public',
	visibilityRest: 'unlisted',
	quoteApproval: 'default',
	quoteLinks: true,
	postCounter: false,
	// @ts-ignore
	defaultLanguage: i18next.language?.split('-')[0] || 'en',
}

export default class MastodonThreading extends Plugin {
	settings: MastodonThreadingSettings;

	async onload() {
		// @ts-ignore
		i18next.addResourceBundle('en', 'plugin-mastodon-threading', lang_en);
		// @ts-ignore
		i18next.addResourceBundle('es', 'plugin-mastodon-threading', lang_es);
		// @ts-ignore
		i18next.addResourceBundle('de', 'plugin-mastodon-threading', lang_de);

		addIcon('mastodon', '<defs id="defs1" /><path style="display:inline;opacity:1;fill:transparent;stroke:currentColor;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1" d="M 80.194896,7.041879 C 61.252354,7.004439 40.245295,6.974149 19.993422,6.993209 12.868784,6.999909 7.088956,12.786413 7.085298,19.908809 7.073308,43.258638 7.065028,75.760167 7.065028,75.760167 l 73.162106,0.0275 A 12.80697,12.802919 0 0 0 93.038918,62.984751 V 19.908797 c 0,-7.09135 -5.750482,-12.852867 -12.844057,-12.86693 z" id="path2" /><path style="display:inline;opacity:1;fill:transparent;stroke:currentColor;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1" d="m 7.065023,75.787671 v 8.597485 a 8.6001932,8.5974803 0 0 0 8.600193,8.597481 h 34.400786" id="path3" /><path style="display:inline;opacity:1;fill:transparent;stroke:currentColor;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1" d="M 71.467494,58.597486 V 32.805037 c 0,-12.896225 -21.478791,-12.765944 -21.467494,0 V 50 l 4e-6,-17.194965 c 0.01118,-12.765944 -21.467493,-12.896225 -21.467495,0 v 25.792451" id="path4-3" />');
		await this.loadSettings();

		// Editor: Send
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				menu.addItem((item) => {
					item
						.setTitle(t('command.send'))
						.setIcon('mastodon')
						.onClick(async () => {
							await this.thread_post(editor);
						});
				});
			})
		);

		// Command: Send thread
		this.addCommand({
			id: 'send-thread',
			name: t('command.send'),
			icon: 'mastodon',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.thread_post(editor);
			}
		});

		// Command: Create fragments
		this.addCommand({
			id: 'create-fragments',
			name: t('command.create_fragments'),
			icon: 'chart-gantt',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.create_fragments(editor);
			}
		});

		// Ribbon: Send thread
		this.addRibbonIcon('mastodon', t('command.send'), () => {
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) {
				this.thread_post(editor);
			}
		});

		// Command: Insert separator
		this.addCommand({
			id: 'insert-separator',
			name: t('command.insert_separator'),
			icon: 'minus',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.insert_separator(editor);
			}
		});

		// Command: Remove separators
		this.addCommand({
			id: 'remove-separators',
			name: t('command.remove_separators'),
			icon: 'equal-not',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.remove_separators(editor);
			}
		});

		// Editor: Insert separator
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				menu.addItem((item) => {
					item
						.setTitle(t('command.insert_separator'))
						.setIcon('minus')
						.onClick(async () => {
							this.insert_separator(editor);
						});
				});
			})
		);


		this.addSettingTab(new MastodonThreadingSettingTab(this.app, this));

		this.registerObsidianProtocolHandler('mastodon-threading',
			async (data) => {
				if (data.action === 'mastodon-threading') {
					this.settings.authToken = await getAuthToken(
						this.settings.server,
						this.settings.clientId,
						this.settings.clientSecret,
						data.code);
					await this.saveSettings();
				}
			});

		this.registerEditorExtension(separatorField(this));
		this.registerMarkdownPostProcessor(separatorPostProcessor);
	}

	insert_separator(editor: Editor) {
		editor.replaceRange(
			editor.getCursor().ch === 0 ? SEPARATOR : `\n${SEPARATOR}`,
			editor.getCursor()
		);
		// Move cursor to the next line, to go on writing
		editor.setCursor({line: editor.getCursor().line + 2, ch: 0});
	}

	async thread_post(editor: Editor) {
		try {
			// Update server parameters and check credentials
			const limit = await this.getInstanceInfo();
			if (await this.checkCredentials()) {
				let requests = 0;
				if (editor.getSelection() || editor.getValue()) {
					type imageMetadata = {
						file: TFile,
						alt: string,
						isimage: boolean,
						mediaId: string | null,
					}
					type postMetadata = {
						text: string,
						warning: string | null,
						images: imageMetadata[],
						quote: string | null,
					}
					let message: string = '';
					if (editor.getSelection()) {
						// If some fragments selected, get only the last one
						let chunks = editor.getSelection().split(SEPARATOR);
						message = chunks[chunks.length - 1];
					} else {
						message = editor.getValue();
					}
					let chunks = message.split(SEPARATOR);
					let posts: postMetadata[] = [];
					let imageList: imageMetadata[] = [];
					let count = 0;
					let descriptions = true;
					for (let c of chunks) {
						if (c.trim().length === 0) {
							new Notice(t('error.void_fragment'));
							return;
						}
						let post: postMetadata = {
							text: c,
							warning: null,
							images: [],
							quote: null,
						}
						// Get images metadata
						for (let m of post.text.matchAll(pattern_image)) {
							let mimetype = mime.getType(m[2].toLowerCase()) || '-'
							if (this.settings.serverMimeTypes.includes(mimetype)) {
								// Only one video allowed, not mixed with images
								if (post.images.length > 0) {
									if (mimetype.startsWith('image')) {
										if (post.images.some(it => !it.isimage)) {
											// Trying to add image to videos
											new Notice(t('error.filetype_not_allowed', {file: m[1]}));
											return;
										}
									} else {
										// Trying to add video to another media
										new Notice(t('error.filetype_not_allowed', {file: m[1]}));
										return;
									}
								}
								let file = this.app.vault.getFileByPath(m[1]);
								if (file === null) {
									// Try on the attachment folder
									// @ts-ignore
									file = this.app.vault.getFileByPath(`${this.app.vault.getConfig("attachmentFolderPath").replace(/^\.\//, '')}/${m[1]}`);
									if (file === null) {
										new Notice(t('error.file_not_found', {file: m[1]}));
										return;
									}
								}
								if (file.stat.size > (mimetype.startsWith('image') ? this.settings.serverMaxImage : this.settings.serverMaxVideo)) {
									new Notice(t('error.file_size_exceeded', {file: m[1]}));
									return;
								}
								let desc: string = '';
								if (m[4]) {
									desc = m[4].replace(/\n> ?/g, '\n')
										.replace(/^> ?/, '').trim();
									if (desc.length > this.settings.serverMaxDescription) {
										new Notice(t('error.alt_exceeded', {max: this.settings.serverMaxDescription}));
										return;
									}
								}
								if (!desc) {
									descriptions = false;
								}
								let newImage: imageMetadata = {
									file: file,
									alt: desc,
									isimage: mimetype.startsWith('image'),
									mediaId: null,
								};
								post.images.push(newImage);
								imageList.push(newImage);
								requests++;
							} else {
								new Notice(t('error.filetype_not_allowed'));
								return;
							}
						}
						if (post.images.length > this.settings.serverMaxAttachments) {
							new Notice(t('error.attachment_exceeded', {max: this.settings.serverMaxAttachments}));
							return;
						}
						// Find content warning
						const found_warning = post.text.match(pattern_warning);
						if (found_warning) {
							post.warning = found_warning[1];
						}
						// Remove images and other patterns from main text
						post.text = post.text.replace(pattern_image, ' ')
							// Simplify links
							.replace(pattern_md_link, '$1')
							// Remove warning blocks
							.replace(pattern_warning, '')
							// Remove quote blocks
							.replace(pattern_quote, '')
							// Finally, strip spaces
							.trim();
						// Find quotes in links
						if (this.settings.serverSupportsQuotes && this.settings.quoteLinks) {
							const found_urls = post.text.match(pattern_url);
							if (found_urls) {
								// Iterate over URLs, searching for mastodon posts
								for (let url: string of found_urls) {
									const res = await this.getClient().v2.search.list({
										q: url, type: 'statuses', resolve: true
									});
									requests++;
									if (res.statuses.length === 1 &&
											(res.statuses[0].quoteApproval.currentUser === 'automatic' ||
										 	 res.statuses[0].quoteApproval.currentUser === 'manual')) {
										post.quote = res.statuses[0].id;
										post.text = post.text.replace(url, '');
										break;  // Only one quote per post
									}
								}
							}
						}
						// Add counter
						if (this.settings.postCounter && chunks.length > 1) {
							post.text += `\n[${++count}/${chunks.length}]`;
						}
						if (post.text.length > this.settings.maxPost) {
							new Notice(t('error.size_exceeded', {max: this.settings.maxPost}));
							return;
						}
						posts.push(post);
						requests++;
					}
					if (limit != null && requests > limit) {
						new Notice(t('error.rate_limit'));
						return;
					}
					new SendThreadModal(this.app, this, posts.length, async (language, visibility_first, visibility_rest) => {
						if (descriptions || confirm(t('modal.no_description'))) {
							try {
								new Notice(t('ok.sending', {'n': 1, 'total': posts.length}));

								// Posting all media first in order to early avoid rate limits
								for (const [i, img] of imageList.entries()) {
									let { data: m, headers } = await this.getClient().v2.media.create.$raw({
										file: new Blob([await this.app.vault.readBinary(img.file)]),
										description: img.alt
									});
									img.mediaId = m.id;
									if (parseInt(headers.get('x-ratelimit-remaining'), 10) < imageList.length - i) {
										new Notice(t('error.rate_limit'));
										return;
									}
								}
								let first = true;
								let id_link: string | null = null;
								for (const [i, p] of posts.entries()) {
									if (i !== 0 && i % 10 === 0) {
										new Notice(t('ok.sending', {'n': (i == 0 ? 1 : i), 'total': posts.length}));
									}
									let media: string[] = [];
									for (let img of p.images) {
										if (img.mediaId) {
											media.push(img.mediaId);
										}
									}
									let {data: status, headers} = await this.getClient().v1.statuses.create.$raw({
										status: p.text,
										spoilerText: p.warning,
										visibility: (first ? visibility_first : visibility_rest),
										inReplyToId: id_link,
										mediaIds: media,
										language: language,
										quotedStatusId: p.quote,
										quoteApprovalPolicy: this.settings.quoteApproval === 'default'? null: this.settings.quoteApproval,
									});
									id_link = status.id;
									first = false;
									if (parseInt(headers.get('x-ratelimit-remaining'), 10) < posts.length - i) {
										new Notice(t('error.rate_limit'));
										return;
									}
								}
								new Notice(posts.length > 1 ? t('ok.thread_posted') : t('ok.message_posted'));
							} catch (err) {
								console.error(err);
								new Notice(t('error.not_posted'));
							}
						}
					}).open();
				} else {
					new Notice(t('error.no_text'));
				}
			} else {
				new Notice(t('error.not_logged'));
			}
		} catch (err) {
			console.error(err);
			new Notice(t('error.not_posted'));
		}
	}

	create_fragments(editor: Editor) {
		// Remove old separators
		this.remove_separators(editor);
		// Insert new separators
		let count = 0;
		for (let i = 0; i < editor.lineCount(); i++) {
			let text = editor.getLine(i);
			// Ignore quotes
			if (!text.startsWith('>')) {
				// Ignore images and shorten links
				text = text.replace(pattern_image, ' ')
					.replace(pattern_md_link, '$1');
				count += text.length + 1;
				if (count > this.settings.maxPost) {
					editor.replaceRange(SEPARATOR, {line: i, ch: 0});
					count = text.length + 1;
				}
			}
		}
	}

	remove_separators(editor: Editor) {
		for (let i = 0; i < editor.lineCount(); i++) {
			if (editor.getLine(i).startsWith(SEPARATOR)) {
				editor.replaceRange('', {line: i, ch: 0}, {line: i, ch: 1})
			}
		}
	}

	async loadSettings() {
		const key = await generateKey(this.app.vault.getName())
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		try {
			if (this.settings.clientSecret) {
				this.settings.clientSecret = await decryptText(key, this.settings.clientSecret);
			}
			if (this.settings.authToken) {
				this.settings.authToken = await decryptText(key, this.settings.authToken);
			}
		}
		catch (err) {
			this.settings.clientSecret = '';
			this.settings.authToken = '';
		}
	}

	async saveSettings() {
		const key = await generateKey(this.app.vault.getName())
		let eClientSecret = this.settings.clientSecret;
		let eAuthToken = this.settings.authToken;
		if (eClientSecret) {
			eClientSecret = await encryptText(key, eClientSecret);
		}
		if (eAuthToken) {
			eAuthToken = await encryptText(key, eAuthToken);
		}
		// Store key and other settings in filesystem, with encrypted secrets
		await this.saveData({...this.settings, clientSecret: eClientSecret, authToken: eAuthToken});
	}

	getClient(): mastodon.rest.Client {
		if (!this.settings.server || !this.settings.authToken) {
			new Notice(t('error.not_logged'));
			throw Error('Missing auth credentials.');
		}
		else {
			try {
				return getClient(this.settings.server, this.settings.authToken);
			} catch (err) {
				new Notice(t('error.session_lost'))
				console.error(err);
				throw err;
			}
		}
	}

	async checkCredentials(): Promise<boolean> {
		const client = this.getClient();
		const app = await client.v1.apps.verifyCredentials();
		return (app.scopes.includes('read:search') &&
			app.scopes.includes('write:media') &&
			app.scopes.includes('write:statuses'));
	}

	async getInstanceInfo() {
		let resp = await requestUrl(`https://${this.settings.server}/api/v2/instance`);
		if (resp.status == 200) {
			let info = await resp.json;
			this.settings.serverMaxPost = info.configuration.statuses.max_characters;
			this.settings.serverMaxDescription = info.configuration.media_attachments.description_limit;
			this.settings.serverMaxImage = info.configuration.media_attachments.image_size_limit;
			this.settings.serverMaxVideo = info.configuration.media_attachments.video_size_limit;
			this.settings.serverMaxAttachments = info.configuration.statuses.max_media_attachments;
			this.settings.serverMimeTypes = info.configuration.media_attachments.supported_mime_types;
			const version = info.version.split(".");
			const major = parseInt(version[0], 10);
			const minor = parseInt(version[1], 10);
			this.settings.serverSupportsQuotes = major > 4 || (major === 4 && minor >= 5);
			await this.saveSettings();
		}
		return parseInt(resp.headers['x-ratelimit-remaining']) || null;
	}
}

class SendThreadModal extends Modal {
  constructor(app: App, plugin: MastodonThreading, count: number, onSubmit: (language: string, visibility_first: StatusVisibility, visibility_rest: StatusVisibility) => void) {
    super(app);
	if (count === 1) {
		this.setTitle(t('command.single_post'));
	} else {
		this.setTitle(t('modal.send_thread_count', {count: count}));
	}

	let language = plugin.settings.defaultLanguage;
	new Setting(this.contentEl)
		.setName(t('modal.post_language'))
		.addDropdown(dropdown => {
				for (const lan of masto_languages.languages) {
					dropdown.addOption(lan[0], `${lan[2]} - ${lan[1]}`);
				}
				dropdown.setValue(language)
				.onChange(async value => {
					language = value;
				});
			}
		);
	let visibility_first = plugin.settings.visibilityFirst;
	new Setting(this.contentEl)
		.setName(count > 1 ? t('modal.visibility_first') : t('modal.visibility_single'))
		.addDropdown(dropdown => dropdown
			.addOption('public', t('settings.visibility.public'))
			.addOption('unlisted', t('settings.visibility.unlisted'))
			.addOption('private', t('settings.visibility.private'))
			.setValue(visibility_first as string)
			.onChange(async value => {
				visibility_first = value as StatusVisibility;
			})
		);
	let visibility_rest = plugin.settings.visibilityRest;
	if (count > 1) {
		new Setting(this.contentEl)
			.setName(t('modal.visibility_rest'))
			.addDropdown(dropdown => dropdown
				.addOption('public', t('settings.visibility.public_not_recommended'))
				.addOption('unlisted', t('settings.visibility.unlisted'))
				.addOption('private', t('settings.visibility.private'))
				.setValue(visibility_rest as string)
				.onChange(async value => {
					visibility_rest = value as StatusVisibility;
				})
			);
	}
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(t('modal.submit'))
          .setCta()
          .onClick(() => {
            this.close();
            onSubmit(language, visibility_first, visibility_rest);
          }));
  }
}

class MastodonThreadingSettingTab extends PluginSettingTab {
	plugin: MastodonThreading;
	displayInterval?: unknown = null;
	lastRefresh: number;

	constructor(app: App, plugin: MastodonThreading) {
		super(app, plugin);
		this.plugin = plugin;
		this.lastRefresh = 0;
	}

	display(): void {
		const {containerEl} = this;

		// Update server info and check credentials if necessary (and possible)
		// (one hour latency period, to avoid hammering)
		if (new Date().getTime() > this.lastRefresh + 3600000) {
			this.lastRefresh = new Date().getTime();
			try {
				this.plugin.getInstanceInfo().then(() => {
					this.display();
				});
				if (this.plugin.settings.server && this.plugin.settings.authToken) {
					this.plugin.checkCredentials().then(ok => {
						if (!ok) {
							this.plugin.settings.authToken = '';
							this.plugin.settings.clientId = '';
							this.plugin.settings.clientSecret = '';
							this.display();
						}
					});
				}
			} catch (err) {
				console.error(err);
			}
		}

		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.server'))
			.setDesc(t('settings.server_desc'))
			.addText(text => text
				.setPlaceholder(t('settings.server_hint'))
				.setValue(this.plugin.settings.server)
				.setDisabled(this.plugin.settings.authToken !== '')
				.onChange(async (value) => {
					this.plugin.settings.server = value.replace(pattern_server, '$2')
					await this.plugin.saveSettings();
				}));
		if (this.plugin.settings.authToken) {
			clearInterval(this.displayInterval as number);
			this.displayInterval = null;
			new Setting(containerEl)
				.setName(t('settings.connect_status', {server: this.plugin.settings.server}))
				.addButton((component) => {
					component.setButtonText(t('settings.disconnect'))
					component.onClick(async () => {
						this.plugin.settings.authToken = '';
						this.plugin.settings.clientId = '';
						this.plugin.settings.clientSecret = '';
						await this.plugin.saveSettings()
						new Notice(t('settings.logged_out'))
						this.display()
					})
				})
		} else {
			if (this.displayInterval === null) {
				new Setting(containerEl)
					.setName(t('settings.connect_to'))
					.addButton((component) => {
						component.setButtonText(t('settings.connect'))
						component.onClick(async () => {
							if (!this.plugin.settings.clientSecret) {
								try {
									let resp = await createApp(this.plugin.settings.server)
									if (resp !== null) {
										this.plugin.settings.clientId = resp.clientId;
										this.plugin.settings.clientSecret = resp.clientSecret;
										await this.plugin.saveSettings();
										// Get instance parameters and update default preferences
										this.plugin.getInstanceInfo().then(() => {
											this.plugin.settings.maxPost = this.plugin.settings.serverMaxPost;
											this.plugin.saveSettings();
											this.display();
										}).catch(err => console.error(err));
									} else {
										new Notice(t('settings.error'));
										return;
									}
								} catch (err) {
									console.error(err);
									new Notice(t('settings.error'));
									return;
								}
							}
							let url = await getAuthURL(
								this.plugin.settings.server, this.plugin.settings.clientId);
							if (url !== null) {
								window.location.href = url;
								this.displayInterval = setInterval(() => {
									this.display()
								}, 1000);
							} else {
								new Notice(t('settings.error'));
								return;
							}
						})
					})
			}
			else {
				new Setting(containerEl)
					.setName(t('settings.connecting', {server: this.plugin.settings.server}))
					.addButton((component) => {
						component.setButtonText(t('settings.cancel'))
						component.onClick(async () => {
							clearInterval(this.displayInterval as number);
							this.displayInterval = null;
							this.display();
						})
					});
			}
		}
		let desc_max_post = new DocumentFragment();
		let descspan = desc_max_post.createSpan();
		descspan.textContent = t('settings.max_post_desc', {
					server: this.plugin.settings.server,
					max: this.plugin.settings.serverMaxPost
				});
		if (this.plugin.settings.maxPost > this.plugin.settings.serverMaxPost) {
			descspan.addClass('warning');
		}
		new Setting(containerEl)
			.setName(t('settings.max_post'))
			.setDesc(this.plugin.settings.authToken? desc_max_post: '')
			.addText(text => text
				.setValue(this.plugin.settings.maxPost.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxPost = parseInt(value) || 500;
					await this.plugin.saveSettings();
					if (this.plugin.settings.maxPost > this.plugin.settings.serverMaxPost) {
						this.plugin.settings.maxPost = this.plugin.settings.serverMaxPost;
						this.display();
					}
				}));
		new Setting(containerEl)
			.setName(t('settings.default_language'))
			.addDropdown(dropdown => {
					for (const lan of masto_languages.languages) {
						dropdown.addOption(lan[0], `${lan[2]} - ${lan[1]}`);
					}
					dropdown.setValue(this.plugin.settings.defaultLanguage)
					.onChange(async value => {
						this.plugin.settings.defaultLanguage = value;
						await this.plugin.saveSettings();
					});
				}
			);
		new Setting(containerEl)
			.setName(t('settings.visibility_first'))
			.setDesc(t('settings.visibility_first_desc'))
			.addDropdown(dropdown => dropdown
				.addOption('public', t('settings.visibility.public'))
				.addOption('unlisted', t('settings.visibility.unlisted'))
				.addOption('private', t('settings.visibility.private'))
				.setValue(this.plugin.settings.visibilityFirst as string)
				.onChange(async value => {
					this.plugin.settings.visibilityFirst = value as StatusVisibility;
					await this.plugin.saveSettings();
				})
			);
		let desc_visibility = t('settings.visibility_rest_desc');
		if (this.plugin.settings.visibilityRest === 'public') {
			desc_visibility = new DocumentFragment();
			let desctext = desc_visibility.createSpan();
			desctext.textContent = t('settings.visibility_warning');
			desctext.addClass('warning');
		}
		new Setting(containerEl)
			.setName(t('settings.visibility_rest'))
			.setDesc(desc_visibility)
			.addDropdown(dropdown => dropdown
				.addOption('public', t('settings.visibility.public_not_recommended'))
				.addOption('unlisted', t('settings.visibility.unlisted'))
				.addOption('private', t('settings.visibility.private'))
				.setValue(this.plugin.settings.visibilityRest as string)
				.onChange(async value => {
					this.plugin.settings.visibilityRest = value as StatusVisibility;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		let quote_approval_desc = t('settings.quote_approval_desc');
		if (!this.plugin.settings.serverSupportsQuotes) {
			quote_approval_desc = new DocumentFragment();
			const errortext1 = quote_approval_desc.createSpan();
			errortext1.textContent = t('settings.quotes_not_supported');
			errortext1.addClass('warning');
		}
		new Setting(containerEl)
			.setName(t('settings.quote_approval'))
			.setDesc(quote_approval_desc)
			.addDropdown(dropdown => dropdown
				.addOption('default', t('settings.quote.default'))
				.addOption('public', t('settings.quote.public'))
				.addOption('followers', t('settings.quote.followers'))
				.addOption('nobody', t('settings.quote.nobody'))
				.setValue(this.plugin.settings.serverSupportsQuotes? this.plugin.settings.quoteApproval as string : 'default')
				.setDisabled(!this.plugin.settings.serverSupportsQuotes)
				.onChange(async value => {
					this.plugin.settings.quoteApproval = value as QuoteApprovalPolicy | 'default';
					await this.plugin.saveSettings();
					this.display();
				})
			);
		let quote_links_desc = t('settings.quote_links_desc');
		if (!this.plugin.settings.serverSupportsQuotes) {
			quote_links_desc = new DocumentFragment();
			const errortext2 = quote_links_desc.createSpan();
			errortext2.textContent = t('settings.quotes_not_supported');
			errortext2.addClass('warning');
		}
		new Setting(containerEl)
			.setName(t('settings.quote_links'))
			.setDesc(quote_links_desc)
			.addToggle(tg => tg
				.setValue(this.plugin.settings.serverSupportsQuotes? this.plugin.settings.quoteLinks : false)
				.setDisabled(!this.plugin.settings.serverSupportsQuotes)
				.onChange(async value => {
					this.plugin.settings.quoteLinks = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName(t('settings.post_counter'))
			.setDesc(t('settings.post_counter_desc'))
			.addToggle(tg => tg
				.setValue(this.plugin.settings.postCounter)
				.onChange(async value => {
					this.plugin.settings.postCounter = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
