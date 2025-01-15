import {Extension, RangeSetBuilder, StateField, Transaction,} from '@codemirror/state';
import {Decoration, DecorationSet, EditorView, WidgetType,} from '@codemirror/view';
import MastodonThreading from "./main";
import {MarkdownPostProcessor} from "obsidian";

const SEPARATOR: string = '§'
const pattern_image = /!\[\[(.*\.(.*?))(\|.*)*]]\s*?((\n>.*)*)/g;
const pattern_url = /\[.*]\((https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*))\)/g;
const pattern_separator = new RegExp('^' + SEPARATOR, 'm');
const pattern_quote = /^>.*\n/gm;
const pattern_server = /(https?:\/\/)?([-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6})\b.*$/gm;

class SeparatorWidget extends WidgetType {
	count: number
	size: number
	limit: number
	constructor(count: number, size: number, limit: number) {
		super();
		this.count = count;
		this.size = size;
		this.limit = limit;
	}
	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement('div');
		div.classList.add('separator');
		if (this.size >= this.limit) {
			div.classList.add('warning');
		}
		const counters = document.createElement('span');
		counters.textContent = `${this.count} (${this.size})`;
		div.appendChild(counters);
		return div;
	}
}

function calculate_size(text: string): number {
	// Calculate fragment size, removing links and code blocks
	return text
		.replace(pattern_image, '')
		.replace(pattern_url, '$1')
		.replace(pattern_separator, '').length;
}

function separatorField(plugin: MastodonThreading) {
    return StateField.define<DecorationSet>({
		create(state): DecorationSet {
			return Decoration.none;
		},
		update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
			const builder = new RangeSetBuilder<Decoration>();
			let pos = 0;
			let count = 0;
			let last_start_pos = -1;
			let last_end_pos = -1;
			let text = '';
			for (let lin of transaction.state.doc) {
				if (lin.startsWith(SEPARATOR)) {
					if (last_start_pos !== -1) {
						if (last_start_pos === last_end_pos) {
							builder.add(last_start_pos, last_end_pos,
								Decoration.widget({
									widget: new SeparatorWidget(
										++count, calculate_size(text), plugin.settings.maxPost)
								}));
						}
						else {
							builder.add(last_start_pos, last_end_pos,
								Decoration.replace({
									widget: new SeparatorWidget(
										++count, calculate_size(text), plugin.settings.maxPost)
								}));
						}
					}
					last_start_pos = pos;
					last_end_pos = pos + SEPARATOR.length
					text = lin;
				}
				else {
					if (pos === 0) {
						// First default separator
						last_start_pos = 0;
						last_end_pos = 0;
					}
					// Quote blocks ignored
					if (!lin.startsWith('>')) {
						text += lin;
					}
				}
				pos += lin.length;
			}
			// Append last separator, only if it's a real separator
			if (last_start_pos !== -1 && last_start_pos !== last_end_pos) {
				builder.add(last_start_pos, last_end_pos,
					Decoration.replace({
						widget: new SeparatorWidget(++count, calculate_size(text), plugin.settings.maxPost)
					}))
			}
			return builder.finish();
		},
		provide(field: StateField<DecorationSet>): Extension {
			return EditorView.decorations.from(field);
		},
	});
}

function replaceSeparators(element: HTMLElement) {
    for (let i = 0; i < element.childNodes.length; i++) {
        const node = element.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trimStart();
			if (text && text.startsWith(SEPARATOR)) {
				element.insertBefore(document.createElement('hr'), node);
				element.insertBefore(
					document.createTextNode(text.replace(new RegExp(`^${SEPARATOR}`), '')), node);
				element.removeChild(node);
			}
        } else {
            replaceSeparators(node as HTMLElement);
        }
    }
}

const separatorPostProcessor: MarkdownPostProcessor =
	(element, context) => replaceSeparators(element);

export {SEPARATOR, separatorField, separatorPostProcessor, pattern_url, pattern_image, pattern_quote, pattern_server}
