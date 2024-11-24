var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function bind(component, name, callback) {
        if (component.$$.props.indexOf(name) === -1)
            return;
        component.$$.bound[name] = callback;
        callback(component.$$.ctx[name]);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/Board.svelte generated by Svelte v3.12.1 */

    const file = "src/Board.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.train = list[i];
    	return child_ctx;
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.station = list[i];
    	return child_ctx;
    }

    // (16:0) {#if relevantStationNames}
    function create_if_block(ctx) {
    	var each_1_anchor;

    	let each_value = ctx.relevantStationNames;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},

    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (changed.trainPredictions || changed.relevantStationNames) {
    				each_value = ctx.relevantStationNames;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach_dev(each_1_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block.name, type: "if", source: "(16:0) {#if relevantStationNames}", ctx });
    	return block;
    }

    // (31:4) {:else}
    function create_else_block(ctx) {
    	var t;

    	const block = {
    		c: function create() {
    			t = text("Loading...");
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(t);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_else_block.name, type: "else", source: "(31:4) {:else}", ctx });
    	return block;
    }

    // (19:4) {#if trainPredictions}
    function create_if_block_1(ctx) {
    	var table, t;

    	let each_value_1 = ctx.trainPredictions;

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			table = element("table");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			add_location(table, file, 19, 6, 522);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}

    			append_dev(table, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.trainPredictions || changed.relevantStationNames) {
    				each_value_1 = ctx.trainPredictions;

    				let i;
    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(table, t);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_1.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(table);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_1.name, type: "if", source: "(19:4) {#if trainPredictions}", ctx });
    	return block;
    }

    // (22:8) {#if train.LocationName == station && train.Destination != "ssenger"}
    function create_if_block_2(ctx) {
    	var tr, td0, span, span_class_value, t0, td1, t1_value = ctx.train.Destination + "", t1, t2, t3, td2, t4_value = ctx.train.Min + "", t4;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			span = element("span");
    			t0 = space();
    			td1 = element("td");
    			t1 = text(t1_value);
    			t2 = text("    ");
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			attr_dev(span, "class", span_class_value = "dot " + ctx.train.Line + " svelte-2n481f");
    			add_location(span, file, 23, 16, 693);
    			add_location(td0, file, 23, 12, 689);
    			add_location(td1, file, 24, 12, 749);
    			add_location(td2, file, 25, 12, 814);
    			attr_dev(tr, "class", "train svelte-2n481f");
    			add_location(tr, file, 22, 10, 658);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, span);
    			append_dev(tr, t0);
    			append_dev(tr, td1);
    			append_dev(td1, t1);
    			append_dev(td1, t2);
    			append_dev(tr, t3);
    			append_dev(tr, td2);
    			append_dev(td2, t4);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.trainPredictions) && span_class_value !== (span_class_value = "dot " + ctx.train.Line + " svelte-2n481f")) {
    				attr_dev(span, "class", span_class_value);
    			}

    			if ((changed.trainPredictions) && t1_value !== (t1_value = ctx.train.Destination + "")) {
    				set_data_dev(t1, t1_value);
    			}

    			if ((changed.trainPredictions) && t4_value !== (t4_value = ctx.train.Min + "")) {
    				set_data_dev(t4, t4_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(tr);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_2.name, type: "if", source: "(22:8) {#if train.LocationName == station && train.Destination != \"ssenger\"}", ctx });
    	return block;
    }

    // (21:6) {#each trainPredictions as train}
    function create_each_block_1(ctx) {
    	var if_block_anchor;

    	var if_block = (ctx.train.LocationName == ctx.station && ctx.train.Destination != "ssenger") && create_if_block_2(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},

    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.train.LocationName == ctx.station && ctx.train.Destination != "ssenger") {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1.name, type: "each", source: "(21:6) {#each trainPredictions as train}", ctx });
    	return block;
    }

    // (17:2) {#each relevantStationNames as station}
    function create_each_block(ctx) {
    	var h1, t0_value = ctx.station.length > 20 ? ctx.station.substring(0,20) : ctx.station + "", t0, t1, if_block_anchor;

    	function select_block_type(changed, ctx) {
    		if (ctx.trainPredictions) return create_if_block_1;
    		return create_else_block;
    	}

    	var current_block_type = select_block_type(null, ctx);
    	var if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t0 = text(t0_value);
    			t1 = space();
    			if_block.c();
    			if_block_anchor = empty();
    			attr_dev(h1, "class", "board-station svelte-2n481f");
    			add_location(h1, file, 17, 4, 400);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			insert_dev(target, t1, anchor);
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.relevantStationNames) && t0_value !== (t0_value = ctx.station.length > 20 ? ctx.station.substring(0,20) : ctx.station + "")) {
    				set_data_dev(t0, t0_value);
    			}

    			if (current_block_type === (current_block_type = select_block_type(changed, ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(h1);
    				detach_dev(t1);
    			}

    			if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block.name, type: "each", source: "(17:2) {#each relevantStationNames as station}", ctx });
    	return block;
    }

    function create_fragment(ctx) {
    	var if_block_anchor;

    	var if_block = (ctx.relevantStationNames) && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.relevantStationNames) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let trainPredictions;
      let { relevantStationNames } = $$props;

      onMount(async () => {
        $$invalidate('trainPredictions', trainPredictions = await getTrainPredictions());
      });

      const getTrainPredictions = async () => {
        const response = await fetch(`./train_predictions`);
        return response.json()
      };

    	const writable_props = ['relevantStationNames'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Board> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    	};

    	$$self.$capture_state = () => {
    		return { trainPredictions, relevantStationNames };
    	};

    	$$self.$inject_state = $$props => {
    		if ('trainPredictions' in $$props) $$invalidate('trainPredictions', trainPredictions = $$props.trainPredictions);
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    	};

    	return { trainPredictions, relevantStationNames };
    }

    class Board extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, ["relevantStationNames"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "Board", options, id: create_fragment.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.relevantStationNames === undefined && !('relevantStationNames' in props)) {
    			console.warn("<Board> was created without expected prop 'relevantStationNames'");
    		}
    	}

    	get relevantStationNames() {
    		throw new Error("<Board>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relevantStationNames(value) {
    		throw new Error("<Board>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/StationPicker.svelte generated by Svelte v3.12.1 */

    const file$1 = "src/StationPicker.svelte";

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.line = list[i];
    	return child_ctx;
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.station = list[i];
    	return child_ctx;
    }

    // (62:12) {#if line}
    function create_if_block$1(ctx) {
    	var span, span_class_value;

    	const block = {
    		c: function create() {
    			span = element("span");
    			attr_dev(span, "class", span_class_value = "dot " + ctx.line + " svelte-4n72g3");
    			add_location(span, file$1, 62, 14, 1929);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.searchResults) && span_class_value !== (span_class_value = "dot " + ctx.line + " svelte-4n72g3")) {
    				attr_dev(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(span);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block$1.name, type: "if", source: "(62:12) {#if line}", ctx });
    	return block;
    }

    // (61:10) {#each station.Lines as line}
    function create_each_block_1$1(ctx) {
    	var if_block_anchor;

    	var if_block = (ctx.line) && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},

    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.line) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1$1.name, type: "each", source: "(61:10) {#each station.Lines as line}", ctx });
    	return block;
    }

    // (56:0) {#each searchResults as station}
    function create_each_block$1(ctx) {
    	var tr, td, button, t0_value = ctx.station.Name.length > 20 ? ctx.station.Name.substring(0,20) : ctx.station.Name + "", t0, t1, button_class_value, t2, dispose;

    	let each_value_1 = ctx.station.Lines;

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	function click_handler() {
    		return ctx.click_handler(ctx);
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			attr_dev(button, "class", button_class_value = "" + null_to_empty((ctx.relevantStationNames.indexOf(ctx.station.Name) > -1 ? "is-relevant" : "")) + " svelte-4n72g3");
    			attr_dev(button, "autocomplete", "off");
    			add_location(button, file$1, 58, 8, 1629);
    			attr_dev(td, "class", "svelte-4n72g3");
    			add_location(td, file$1, 57, 6, 1616);
    			attr_dev(tr, "class", "station svelte-4n72g3");
    			add_location(tr, file$1, 56, 4, 1589);
    			dispose = listen_dev(button, "click", click_handler);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td);
    			append_dev(td, button);
    			append_dev(button, t0);
    			append_dev(button, t1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(button, null);
    			}

    			append_dev(tr, t2);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if ((changed.searchResults) && t0_value !== (t0_value = ctx.station.Name.length > 20 ? ctx.station.Name.substring(0,20) : ctx.station.Name + "")) {
    				set_data_dev(t0, t0_value);
    			}

    			if (changed.searchResults) {
    				each_value_1 = ctx.station.Lines;

    				let i;
    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(button, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_1.length;
    			}

    			if ((changed.relevantStationNames || changed.searchResults) && button_class_value !== (button_class_value = "" + null_to_empty((ctx.relevantStationNames.indexOf(ctx.station.Name) > -1 ? "is-relevant" : "")) + " svelte-4n72g3")) {
    				attr_dev(button, "class", button_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(tr);
    			}

    			destroy_each(each_blocks, detaching);

    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block$1.name, type: "each", source: "(56:0) {#each searchResults as station}", ctx });
    	return block;
    }

    function create_fragment$1(ctx) {
    	var input, input_placeholder_value, t, table, dispose;

    	let each_value = ctx.searchResults;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			input = element("input");
    			t = space();
    			table = element("table");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			attr_dev(input, "type", "text");
    			attr_dev(input, "id", "search");
    			attr_dev(input, "placeholder", input_placeholder_value = "🔍 " + ctx.placeholder);
    			attr_dev(input, "class", "svelte-4n72g3");
    			add_location(input, file$1, 53, 0, 1436);
    			attr_dev(table, "class", "svelte-4n72g3");
    			add_location(table, file$1, 54, 0, 1544);

    			dispose = [
    				listen_dev(input, "input", ctx.input_input_handler),
    				listen_dev(input, "input", ctx.searchStations)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);

    			set_input_value(input, ctx.query);

    			insert_dev(target, t, anchor);
    			insert_dev(target, table, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.query && (input.value !== ctx.query)) set_input_value(input, ctx.query);

    			if ((changed.placeholder) && input_placeholder_value !== (input_placeholder_value = "🔍 " + ctx.placeholder)) {
    				attr_dev(input, "placeholder", input_placeholder_value);
    			}

    			if (changed.relevantStationNames || changed.searchResults) {
    				each_value = ctx.searchResults;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(table, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(input);
    				detach_dev(t);
    				detach_dev(table);
    			}

    			destroy_each(each_blocks, detaching);

    			run_all(dispose);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$1.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let allStations;
      let query = "";
      let searchResults = [];
      let placeholder;
      let { relevantStations } = $$props;
      onMount(async () => {
        allStations = await getStations();
        $$invalidate('searchResults', searchResults = []);
      });

      const getStations = async () => {
        const response = await fetch(`./stations`);
        return response.json()
      };

      const searchStations = () => {
        if (query == "") {
          return $$invalidate('searchResults', searchResults = [])
        }
        else {
          return $$invalidate('searchResults', searchResults = allStations.filter(station => {
            gtag('event', 'stationSearch', {"query": query});
            let stationName = station.Name.toLowerCase().replace("'", "");
            return stationName.includes(query.toLowerCase().replace("'", ""))
          }))
        } 
        
      };

      const toggle = (station) => { 
        if (relevantStations && station) {
          let i = relevantStationNames.indexOf(station.Name);
          if (i > -1) {
            $$invalidate('relevantStations', relevantStations = [...relevantStations.slice(0, i), ...relevantStations.slice(i + 1)]);
          }
          else {        
            $$invalidate('relevantStations', relevantStations = [...relevantStations, station]);
          }
          localStorage.setItem("relevantStations", JSON.stringify(relevantStations));
          gtag('event', 'addStation', {"station": station});
        }
        $$invalidate('query', query = "");
        searchStations();
      };

    	const writable_props = ['relevantStations'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<StationPicker> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		query = this.value;
    		$$invalidate('query', query);
    	}

    	const click_handler = ({ station }) => toggle(station);

    	$$self.$set = $$props => {
    		if ('relevantStations' in $$props) $$invalidate('relevantStations', relevantStations = $$props.relevantStations);
    	};

    	$$self.$capture_state = () => {
    		return { allStations, query, searchResults, placeholder, relevantStations, relevantStationNames };
    	};

    	$$self.$inject_state = $$props => {
    		if ('allStations' in $$props) allStations = $$props.allStations;
    		if ('query' in $$props) $$invalidate('query', query = $$props.query);
    		if ('searchResults' in $$props) $$invalidate('searchResults', searchResults = $$props.searchResults);
    		if ('placeholder' in $$props) $$invalidate('placeholder', placeholder = $$props.placeholder);
    		if ('relevantStations' in $$props) $$invalidate('relevantStations', relevantStations = $$props.relevantStations);
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    	};

    	let relevantStationNames;

    	$$self.$$.update = ($$dirty = { relevantStations: 1 }) => {
    		if ($$dirty.relevantStations) { $$invalidate('relevantStationNames', relevantStationNames = relevantStations.map(station => station.Name)); }
    		if ($$dirty.relevantStations) { $$invalidate('placeholder', placeholder = relevantStations.length == 0 ? "Add stations" : ""); }
    	};

    	return {
    		query,
    		searchResults,
    		placeholder,
    		relevantStations,
    		searchStations,
    		toggle,
    		relevantStationNames,
    		input_input_handler,
    		click_handler
    	};
    }

    class StationPicker extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["relevantStations"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "StationPicker", options, id: create_fragment$1.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.relevantStations === undefined && !('relevantStations' in props)) {
    			console.warn("<StationPicker> was created without expected prop 'relevantStations'");
    		}
    	}

    	get relevantStations() {
    		throw new Error("<StationPicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relevantStations(value) {
    		throw new Error("<StationPicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/App.svelte generated by Svelte v3.12.1 */

    const file$2 = "src/App.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.station = list[i];
    	return child_ctx;
    }

    // (34:2) {#each relevantStations as station}
    function create_each_block$2(ctx) {
    	var span, t0_value = ctx.station.Name.length > 20 ? ctx.station.Name.substring(0,20) : ctx.station.Name + "", t0, t1, dispose;

    	function click_handler() {
    		return ctx.click_handler(ctx);
    	}

    	const block = {
    		c: function create() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = text("  X");
    			attr_dev(span, "class", "station svelte-1dug51i");
    			add_location(span, file$2, 34, 4, 1176);
    			dispose = listen_dev(span, "click", click_handler);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t0);
    			append_dev(span, t1);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if ((changed.relevantStations) && t0_value !== (t0_value = ctx.station.Name.length > 20 ? ctx.station.Name.substring(0,20) : ctx.station.Name + "")) {
    				set_data_dev(t0, t0_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(span);
    			}

    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block$2.name, type: "each", source: "(34:2) {#each relevantStations as station}", ctx });
    	return block;
    }

    function create_fragment$2(ctx) {
    	var div, t0, updating_relevantStations, t1, updating_relevantStationNames, current;

    	let each_value = ctx.relevantStations;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	function stationpicker_relevantStations_binding(value) {
    		ctx.stationpicker_relevantStations_binding.call(null, value);
    		updating_relevantStations = true;
    		add_flush_callback(() => updating_relevantStations = false);
    	}

    	let stationpicker_props = {};
    	if (ctx.relevantStations !== void 0) {
    		stationpicker_props.relevantStations = ctx.relevantStations;
    	}
    	var stationpicker = new StationPicker({
    		props: stationpicker_props,
    		$$inline: true
    	});

    	binding_callbacks.push(() => bind(stationpicker, 'relevantStations', stationpicker_relevantStations_binding));

    	function board_relevantStationNames_binding(value_1) {
    		ctx.board_relevantStationNames_binding.call(null, value_1);
    		updating_relevantStationNames = true;
    		add_flush_callback(() => updating_relevantStationNames = false);
    	}

    	let board_props = {};
    	if (ctx.relevantStationNames !== void 0) {
    		board_props.relevantStationNames = ctx.relevantStationNames;
    	}
    	var board = new Board({ props: board_props, $$inline: true });

    	binding_callbacks.push(() => bind(board, 'relevantStationNames', board_relevantStationNames_binding));

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			stationpicker.$$.fragment.c();
    			t1 = space();
    			board.$$.fragment.c();
    			attr_dev(div, "class", "relevant-stations svelte-1dug51i");
    			add_location(div, file$2, 32, 0, 1102);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			insert_dev(target, t0, anchor);
    			mount_component(stationpicker, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(board, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (changed.relevantStations) {
    				each_value = ctx.relevantStations;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			var stationpicker_changes = {};
    			if (!updating_relevantStations && changed.relevantStations) {
    				stationpicker_changes.relevantStations = ctx.relevantStations;
    			}
    			stationpicker.$set(stationpicker_changes);

    			var board_changes = {};
    			if (!updating_relevantStationNames && changed.relevantStationNames) {
    				board_changes.relevantStationNames = ctx.relevantStationNames;
    			}
    			board.$set(board_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(stationpicker.$$.fragment, local);

    			transition_in(board.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(stationpicker.$$.fragment, local);
    			transition_out(board.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(div);
    			}

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach_dev(t0);
    			}

    			destroy_component(stationpicker, detaching);

    			if (detaching) {
    				detach_dev(t1);
    			}

    			destroy_component(board, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$2.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	
      let relevantStations = [];
      let relevantStationNames = "";
      let possibleLines = [];
      let relevantLines = possibleLines;
      if (localStorage.getItem("relevantStations")) {
          $$invalidate('relevantStations', relevantStations = JSON.parse(localStorage.getItem("relevantStations")));
      }

      const toggle = (station) => { 
        if (relevantStations && station) {
          let i = relevantStationNames.indexOf(station.Name);
          if (i > -1) {
            $$invalidate('relevantStations', relevantStations = [...relevantStations.slice(0, i), ...relevantStations.slice(i + 1)]);
            gtag('event', 'removeStation', {"station": station, "button": "top-button"});
          }
          else {        
            $$invalidate('relevantStations', relevantStations = [...relevantStations, station]);
          }
          localStorage.setItem("relevantStations", JSON.stringify(relevantStations));
        }
      };

    	const click_handler = ({ station }) => toggle(station);

    	function stationpicker_relevantStations_binding(value) {
    		relevantStations = value;
    		$$invalidate('relevantStations', relevantStations);
    	}

    	function board_relevantStationNames_binding(value_1) {
    		relevantStationNames = value_1;
    		$$invalidate('relevantStationNames', relevantStationNames), $$invalidate('relevantStations', relevantStations);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ('relevantStations' in $$props) $$invalidate('relevantStations', relevantStations = $$props.relevantStations);
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    		if ('possibleLines' in $$props) possibleLines = $$props.possibleLines;
    		if ('relevantLines' in $$props) relevantLines = $$props.relevantLines;
    	};

    	$$self.$$.update = ($$dirty = { relevantStations: 1 }) => {
    		if ($$dirty.relevantStations) { $$invalidate('relevantStationNames', relevantStationNames = relevantStations.map(station => station.Name)); }
    		if ($$dirty.relevantStations) { possibleLines = [... new Set(relevantStations.map(station => station.Lines).flat())]; }
    	};

    	return {
    		relevantStations,
    		relevantStationNames,
    		toggle,
    		click_handler,
    		stationpicker_relevantStations_binding,
    		board_relevantStationNames_binding
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, []);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "App", options, id: create_fragment$2.name });
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
