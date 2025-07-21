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
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
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

    // (32:0) {#if relevantStationNames}
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
    			if (changed.trainPredictions || changed.relevantStationNames || changed.hideBusses) {
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block.name, type: "if", source: "(32:0) {#if relevantStationNames}", ctx });
    	return block;
    }

    // (47:4) {:else}
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_else_block.name, type: "else", source: "(47:4) {:else}", ctx });
    	return block;
    }

    // (35:4) {#if trainPredictions}
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
    			add_location(table, file, 35, 6, 1095);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_1.name, type: "if", source: "(35:4) {#if trainPredictions}", ctx });
    	return block;
    }

    // (38:8) {#if train.LocationName == station && train.Destination != "ssenger"}
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
    			add_location(span, file, 39, 16, 1266);
    			add_location(td0, file, 39, 12, 1262);
    			add_location(td1, file, 40, 12, 1322);
    			add_location(td2, file, 41, 12, 1387);
    			attr_dev(tr, "class", "train svelte-2n481f");
    			add_location(tr, file, 38, 10, 1231);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_2.name, type: "if", source: "(38:8) {#if train.LocationName == station && train.Destination != \"ssenger\"}", ctx });
    	return block;
    }

    // (37:6) {#each trainPredictions as train}
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1.name, type: "each", source: "(37:6) {#each trainPredictions as train}", ctx });
    	return block;
    }

    // (33:2) {#each relevantStationNames as station}
    function create_each_block(ctx) {
    	var h1, t0_value = ctx.hideBusses ? "" : "🚆" + "", t0, t1, t2_value = ctx.station.length > 20 ? ctx.station.substring(0,20) : ctx.station + "", t2, t3, if_block_anchor;

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
    			t2 = text(t2_value);
    			t3 = space();
    			if_block.c();
    			if_block_anchor = empty();
    			attr_dev(h1, "class", "board-station svelte-2n481f");
    			add_location(h1, file, 33, 4, 948);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			insert_dev(target, t3, anchor);
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.hideBusses) && t0_value !== (t0_value = ctx.hideBusses ? "" : "🚆" + "")) {
    				set_data_dev(t0, t0_value);
    			}

    			if ((changed.relevantStationNames) && t2_value !== (t2_value = ctx.station.length > 20 ? ctx.station.substring(0,20) : ctx.station + "")) {
    				set_data_dev(t2, t2_value);
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
    				detach_dev(t3);
    			}

    			if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block.name, type: "each", source: "(33:2) {#each relevantStationNames as station}", ctx });
    	return block;
    }

    function create_fragment(ctx) {
    	var a, t1, t2, t3, if_block_anchor, dispose;

    	var if_block = (ctx.relevantStationNames) && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "🔄";
    			t1 = text("\nlast updated ");
    			t2 = text(ctx.secondsSinceLastUpdate);
    			t3 = text(" seconds ago\n");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(a, "href", "#");
    			add_location(a, file, 29, 0, 778);
    			dispose = listen_dev(a, "click", ctx.click_handler);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, t3, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (changed.secondsSinceLastUpdate) {
    				set_data_dev(t2, ctx.secondsSinceLastUpdate);
    			}

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
    			if (detaching) {
    				detach_dev(a);
    				detach_dev(t1);
    				detach_dev(t2);
    				detach_dev(t3);
    			}

    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}

    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let trainPredictions, secondsSinceLastUpdate, updatedAt;
      let { relevantStationNames, hideBusses } = $$props;

      onMount(async () => {
        getTrainPredictions();
        setInterval(function(){
          $$invalidate('secondsSinceLastUpdate', secondsSinceLastUpdate = Math.round((new Date() - updatedAt) / 1000));
          // if (secondsSinceLastUpdate >= 30) {
          //   getTrainPredictions()
          // }
        }, 1000);
      });

      const getTrainPredictions = async () => {
        const response = await fetch(`./train_predictions`);
        $$invalidate('trainPredictions', trainPredictions = await response.json());
        updatedAt = await new Date();
        $$invalidate('secondsSinceLastUpdate', secondsSinceLastUpdate = Math.round((new Date() - updatedAt) / 1000));
      };

      const refresh = () => {
        gtag('event', 'refresh', {});
        location.reload();
      };

    	const writable_props = ['relevantStationNames', 'hideBusses'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Board> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => refresh();

    	$$self.$set = $$props => {
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    		if ('hideBusses' in $$props) $$invalidate('hideBusses', hideBusses = $$props.hideBusses);
    	};

    	$$self.$capture_state = () => {
    		return { trainPredictions, secondsSinceLastUpdate, updatedAt, relevantStationNames, hideBusses };
    	};

    	$$self.$inject_state = $$props => {
    		if ('trainPredictions' in $$props) $$invalidate('trainPredictions', trainPredictions = $$props.trainPredictions);
    		if ('secondsSinceLastUpdate' in $$props) $$invalidate('secondsSinceLastUpdate', secondsSinceLastUpdate = $$props.secondsSinceLastUpdate);
    		if ('updatedAt' in $$props) updatedAt = $$props.updatedAt;
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    		if ('hideBusses' in $$props) $$invalidate('hideBusses', hideBusses = $$props.hideBusses);
    	};

    	return {
    		trainPredictions,
    		secondsSinceLastUpdate,
    		relevantStationNames,
    		hideBusses,
    		refresh,
    		click_handler
    	};
    }

    class Board extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, ["relevantStationNames", "hideBusses"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "Board", options, id: create_fragment.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.relevantStationNames === undefined && !('relevantStationNames' in props)) {
    			console.warn("<Board> was created without expected prop 'relevantStationNames'");
    		}
    		if (ctx.hideBusses === undefined && !('hideBusses' in props)) {
    			console.warn("<Board> was created without expected prop 'hideBusses'");
    		}
    	}

    	get relevantStationNames() {
    		throw new Error("<Board>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relevantStationNames(value) {
    		throw new Error("<Board>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hideBusses() {
    		throw new Error("<Board>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hideBusses(value) {
    		throw new Error("<Board>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/BusBoard.svelte generated by Svelte v3.12.1 */

    const file$1 = "src/BusBoard.svelte";

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.bus = list[i];
    	return child_ctx;
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stop = list[i];
    	return child_ctx;
    }

    // (15:0) {#if relevantBusStops}
    function create_if_block$1(ctx) {
    	var each_1_anchor;

    	let each_value = ctx.relevantBusStops;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
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
    			if (changed.busPredictions || changed.relevantBusStops) {
    				each_value = ctx.relevantBusStops;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block$1.name, type: "if", source: "(15:0) {#if relevantBusStops}", ctx });
    	return block;
    }

    // (29:4) {:else}
    function create_else_block$1(ctx) {
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_else_block$1.name, type: "else", source: "(29:4) {:else}", ctx });
    	return block;
    }

    // (19:4) {#if busPredictions && busPredictions[stop.StopID]}
    function create_if_block_1$1(ctx) {
    	var table, t;

    	let each_value_1 = ctx.busPredictions[ctx.stop.StopID];

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			table = element("table");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			add_location(table, file$1, 19, 6, 543);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, table, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}

    			append_dev(table, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.busPredictions || changed.relevantBusStops) {
    				each_value_1 = ctx.busPredictions[ctx.stop.StopID];

    				let i;
    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1$1(child_ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_1$1.name, type: "if", source: "(19:4) {#if busPredictions && busPredictions[stop.StopID]}", ctx });
    	return block;
    }

    // (21:8) {#each busPredictions[stop.StopID] as bus}
    function create_each_block_1$1(ctx) {
    	var tr, td0, span, t0_value = ctx.bus.RouteID + "", t0, t1, td1, t2_value = ctx.bus.DirectionText + "", t2, t3, t4, td2, t5_value = ctx.bus.Minutes + "", t5;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = text("    ");
    			t4 = space();
    			td2 = element("td");
    			t5 = text(t5_value);
    			attr_dev(span, "class", "route svelte-78wqtk");
    			add_location(span, file$1, 22, 16, 645);
    			add_location(td0, file$1, 22, 12, 641);
    			add_location(td1, file$1, 23, 12, 703);
    			add_location(td2, file$1, 24, 12, 768);
    			attr_dev(tr, "class", "bus svelte-78wqtk");
    			add_location(tr, file$1, 21, 10, 612);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, span);
    			append_dev(span, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(td1, t3);
    			append_dev(tr, t4);
    			append_dev(tr, td2);
    			append_dev(td2, t5);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.busPredictions || changed.relevantBusStops) && t0_value !== (t0_value = ctx.bus.RouteID + "")) {
    				set_data_dev(t0, t0_value);
    			}

    			if ((changed.busPredictions || changed.relevantBusStops) && t2_value !== (t2_value = ctx.bus.DirectionText + "")) {
    				set_data_dev(t2, t2_value);
    			}

    			if ((changed.busPredictions || changed.relevantBusStops) && t5_value !== (t5_value = ctx.bus.Minutes + "")) {
    				set_data_dev(t5, t5_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(tr);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1$1.name, type: "each", source: "(21:8) {#each busPredictions[stop.StopID] as bus}", ctx });
    	return block;
    }

    // (16:2) {#each relevantBusStops as stop}
    function create_each_block$1(ctx) {
    	var h1, t0, t1_value = ctx.stop.Name + "", t1, span, t2_value = ctx.stop.StopID + "", t2, t3, if_block_anchor;

    	function select_block_type(changed, ctx) {
    		if (ctx.busPredictions && ctx.busPredictions[ctx.stop.StopID]) return create_if_block_1$1;
    		return create_else_block$1;
    	}

    	var current_block_type = select_block_type(null, ctx);
    	var if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t0 = text("🚌 ");
    			t1 = text(t1_value);
    			span = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			if_block.c();
    			if_block_anchor = empty();
    			attr_dev(span, "class", "stop-id svelte-78wqtk");
    			add_location(span, file$1, 16, 41, 428);
    			attr_dev(h1, "class", "board-stop svelte-78wqtk");
    			add_location(h1, file$1, 16, 4, 391);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			append_dev(h1, span);
    			append_dev(span, t2);
    			insert_dev(target, t3, anchor);
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.relevantBusStops) && t1_value !== (t1_value = ctx.stop.Name + "")) {
    				set_data_dev(t1, t1_value);
    			}

    			if ((changed.relevantBusStops) && t2_value !== (t2_value = ctx.stop.StopID + "")) {
    				set_data_dev(t2, t2_value);
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
    				detach_dev(t3);
    			}

    			if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block$1.name, type: "each", source: "(16:2) {#each relevantBusStops as stop}", ctx });
    	return block;
    }

    function create_fragment$1(ctx) {
    	var if_block_anchor;

    	var if_block = (ctx.relevantBusStops) && create_if_block$1(ctx);

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
    			if (ctx.relevantBusStops) {
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

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach_dev(if_block_anchor);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$1.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let busPredictions;
      let { relevantBusStops } = $$props;

      const getBusPredictions = async (stops) => {
        const response = await fetch(`./bus_predictions/` + JSON.stringify(stops.map(stop => {return stop.StopID})));
        $$invalidate('busPredictions', busPredictions = await response.json());
      };

    	const writable_props = ['relevantBusStops'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<BusBoard> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('relevantBusStops' in $$props) $$invalidate('relevantBusStops', relevantBusStops = $$props.relevantBusStops);
    	};

    	$$self.$capture_state = () => {
    		return { busPredictions, relevantBusStops };
    	};

    	$$self.$inject_state = $$props => {
    		if ('busPredictions' in $$props) $$invalidate('busPredictions', busPredictions = $$props.busPredictions);
    		if ('relevantBusStops' in $$props) $$invalidate('relevantBusStops', relevantBusStops = $$props.relevantBusStops);
    	};

    	$$self.$$.update = ($$dirty = { relevantBusStops: 1 }) => {
    		if ($$dirty.relevantBusStops) { getBusPredictions(relevantBusStops); }
    	};

    	return { busPredictions, relevantBusStops };
    }

    class BusBoard extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["relevantBusStops"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "BusBoard", options, id: create_fragment$1.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.relevantBusStops === undefined && !('relevantBusStops' in props)) {
    			console.warn("<BusBoard> was created without expected prop 'relevantBusStops'");
    		}
    	}

    	get relevantBusStops() {
    		throw new Error("<BusBoard>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relevantBusStops(value) {
    		throw new Error("<BusBoard>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/StationPicker.svelte generated by Svelte v3.12.1 */

    const file$2 = "src/StationPicker.svelte";

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.line = list[i];
    	return child_ctx;
    }

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.station = list[i];
    	return child_ctx;
    }

    // (62:12) {#if line}
    function create_if_block$2(ctx) {
    	var span, span_class_value;

    	const block = {
    		c: function create() {
    			span = element("span");
    			attr_dev(span, "class", span_class_value = "dot " + ctx.line + " svelte-4n72g3");
    			add_location(span, file$2, 62, 14, 1989);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block$2.name, type: "if", source: "(62:12) {#if line}", ctx });
    	return block;
    }

    // (61:10) {#each station.Lines as line}
    function create_each_block_1$2(ctx) {
    	var if_block_anchor;

    	var if_block = (ctx.line) && create_if_block$2(ctx);

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
    					if_block = create_if_block$2(ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1$2.name, type: "each", source: "(61:10) {#each station.Lines as line}", ctx });
    	return block;
    }

    // (56:0) {#each searchResults as station}
    function create_each_block$2(ctx) {
    	var tr, td, button, t0_value = ctx.station.Name.length > 20 ? ctx.station.Name.substring(0,20) : ctx.station.Name + "", t0, t1, button_class_value, t2, dispose;

    	let each_value_1 = ctx.station.Lines;

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
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
    			add_location(button, file$2, 58, 8, 1689);
    			attr_dev(td, "class", "svelte-4n72g3");
    			add_location(td, file$2, 57, 6, 1676);
    			attr_dev(tr, "class", "station svelte-4n72g3");
    			add_location(tr, file$2, 56, 4, 1649);
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
    					const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1$2(child_ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block$2.name, type: "each", source: "(56:0) {#each searchResults as station}", ctx });
    	return block;
    }

    function create_fragment$2(ctx) {
    	var input, input_placeholder_value, t, table, dispose;

    	let each_value = ctx.searchResults;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
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
    			attr_dev(input, "placeholder", input_placeholder_value = "" + (ctx.hideBusses ? "" : "🚆") + " " + placeholder);
    			attr_dev(input, "class", "svelte-4n72g3");
    			add_location(input, file$2, 53, 0, 1474);
    			attr_dev(table, "class", "svelte-4n72g3");
    			add_location(table, file$2, 54, 0, 1604);

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

    			if ((changed.hideBusses) && input_placeholder_value !== (input_placeholder_value = "" + (ctx.hideBusses ? "" : "🚆") + " " + placeholder)) {
    				attr_dev(input, "placeholder", input_placeholder_value);
    			}

    			if (changed.relevantStationNames || changed.searchResults) {
    				each_value = ctx.searchResults;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$2.name, type: "component", source: "", ctx });
    	return block;
    }

    let placeholder = "Add train stations";

    function instance$2($$self, $$props, $$invalidate) {
    	let allStations;
      let query = "";
      let searchResults = [];
      let { relevantStations, hideBusses } = $$props;
      // $: placeholder = relevantStations.length == 0 ? "Add stations" : ""
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

    	const writable_props = ['relevantStations', 'hideBusses'];
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
    		if ('hideBusses' in $$props) $$invalidate('hideBusses', hideBusses = $$props.hideBusses);
    	};

    	$$self.$capture_state = () => {
    		return { allStations, query, searchResults, placeholder, relevantStations, hideBusses, relevantStationNames };
    	};

    	$$self.$inject_state = $$props => {
    		if ('allStations' in $$props) allStations = $$props.allStations;
    		if ('query' in $$props) $$invalidate('query', query = $$props.query);
    		if ('searchResults' in $$props) $$invalidate('searchResults', searchResults = $$props.searchResults);
    		if ('placeholder' in $$props) $$invalidate('placeholder', placeholder = $$props.placeholder);
    		if ('relevantStations' in $$props) $$invalidate('relevantStations', relevantStations = $$props.relevantStations);
    		if ('hideBusses' in $$props) $$invalidate('hideBusses', hideBusses = $$props.hideBusses);
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    	};

    	let relevantStationNames;

    	$$self.$$.update = ($$dirty = { relevantStations: 1 }) => {
    		if ($$dirty.relevantStations) { $$invalidate('relevantStationNames', relevantStationNames = relevantStations.map(station => station.Name)); }
    	};

    	return {
    		query,
    		searchResults,
    		relevantStations,
    		hideBusses,
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
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, ["relevantStations", "hideBusses"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "StationPicker", options, id: create_fragment$2.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.relevantStations === undefined && !('relevantStations' in props)) {
    			console.warn("<StationPicker> was created without expected prop 'relevantStations'");
    		}
    		if (ctx.hideBusses === undefined && !('hideBusses' in props)) {
    			console.warn("<StationPicker> was created without expected prop 'hideBusses'");
    		}
    	}

    	get relevantStations() {
    		throw new Error("<StationPicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relevantStations(value) {
    		throw new Error("<StationPicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hideBusses() {
    		throw new Error("<StationPicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hideBusses(value) {
    		throw new Error("<StationPicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/BusStopPicker.svelte generated by Svelte v3.12.1 */

    const file$3 = "src/BusStopPicker.svelte";

    function get_each_context_1$3(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.route = list[i];
    	return child_ctx;
    }

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stop = list[i];
    	return child_ctx;
    }

    // (72:14) {#if !route.includes("*") && !route.includes("/")}
    function create_if_block$3(ctx) {
    	var span, t_value = ctx.route + "", t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr_dev(span, "class", "route svelte-13wfgbt");
    			add_location(span, file$3, 72, 16, 2172);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.searchResults) && t_value !== (t_value = ctx.route + "")) {
    				set_data_dev(t, t_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(span);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block$3.name, type: "if", source: "(72:14) {#if !route.includes(\"*\") && !route.includes(\"/\")}", ctx });
    	return block;
    }

    // (71:12) {#each stop.Routes as route}
    function create_each_block_1$3(ctx) {
    	var show_if = !ctx.route.includes("*") && !ctx.route.includes("/"), if_block_anchor;

    	var if_block = (show_if) && create_if_block$3(ctx);

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
    			if (changed.searchResults) show_if = !ctx.route.includes("*") && !ctx.route.includes("/");

    			if (show_if) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block$3(ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1$3.name, type: "each", source: "(71:12) {#each stop.Routes as route}", ctx });
    	return block;
    }

    // (62:0) {#each searchResults as stop}
    function create_each_block$3(ctx) {
    	var tr, td, button, span0, t0_value = ctx.stop.Name + "", t0, t1, div0, span1, t2_value = ctx.stop.StopID + "", t2, t3, div1, button_class_value, t4, dispose;

    	let each_value_1 = ctx.stop.Routes;

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$3(get_each_context_1$3(ctx, each_value_1, i));
    	}

    	function click_handler() {
    		return ctx.click_handler(ctx);
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			button = element("button");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			div0 = element("div");
    			span1 = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t4 = space();
    			attr_dev(span0, "class", "svelte-13wfgbt");
    			add_location(span0, file$3, 65, 10, 1906);
    			attr_dev(span1, "class", "stop-id svelte-13wfgbt");
    			add_location(span1, file$3, 67, 12, 1959);
    			attr_dev(div0, "class", "svelte-13wfgbt");
    			add_location(div0, file$3, 66, 10, 1941);
    			attr_dev(div1, "class", "routes svelte-13wfgbt");
    			add_location(div1, file$3, 69, 10, 2029);
    			attr_dev(button, "class", button_class_value = "stop-result " + (ctx.relevantBusStopNames.indexOf(ctx.stop.Name) > -1 ? "is-relevant" : "") + " svelte-13wfgbt");
    			attr_dev(button, "autocomplete", "off");
    			add_location(button, file$3, 64, 8, 1750);
    			attr_dev(td, "class", "svelte-13wfgbt");
    			add_location(td, file$3, 63, 6, 1737);
    			attr_dev(tr, "class", "stop svelte-13wfgbt");
    			add_location(tr, file$3, 62, 4, 1713);
    			dispose = listen_dev(button, "click", click_handler);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td);
    			append_dev(td, button);
    			append_dev(button, span0);
    			append_dev(span0, t0);
    			append_dev(button, t1);
    			append_dev(button, div0);
    			append_dev(div0, span1);
    			append_dev(span1, t2);
    			append_dev(button, t3);
    			append_dev(button, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append_dev(tr, t4);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if ((changed.searchResults) && t0_value !== (t0_value = ctx.stop.Name + "")) {
    				set_data_dev(t0, t0_value);
    			}

    			if ((changed.searchResults) && t2_value !== (t2_value = ctx.stop.StopID + "")) {
    				set_data_dev(t2, t2_value);
    			}

    			if (changed.searchResults) {
    				each_value_1 = ctx.stop.Routes;

    				let i;
    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$3(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_1.length;
    			}

    			if ((changed.relevantBusStopNames || changed.searchResults) && button_class_value !== (button_class_value = "stop-result " + (ctx.relevantBusStopNames.indexOf(ctx.stop.Name) > -1 ? "is-relevant" : "") + " svelte-13wfgbt")) {
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block$3.name, type: "each", source: "(62:0) {#each searchResults as stop}", ctx });
    	return block;
    }

    function create_fragment$3(ctx) {
    	var input, t, table, dispose;

    	let each_value = ctx.searchResults;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
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
    			attr_dev(input, "placeholder", "🚌 " + placeholder$1);
    			attr_dev(input, "class", "svelte-13wfgbt");
    			add_location(input, file$3, 59, 0, 1563);
    			attr_dev(table, "class", "svelte-13wfgbt");
    			add_location(table, file$3, 60, 0, 1671);

    			dispose = [
    				listen_dev(input, "input", ctx.input_input_handler),
    				listen_dev(input, "input", ctx.searchBusStops)
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

    			if (changed.relevantBusStopNames || changed.searchResults) {
    				each_value = ctx.searchResults;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$3.name, type: "component", source: "", ctx });
    	return block;
    }

    let placeholder$1 = "Add bus stops";

    function instance$3($$self, $$props, $$invalidate) {
    	let allBusStops;
      let query = "";
      let searchResults = [];
      let busPredictions;
      let { relevantBusStops } = $$props;
      // $: console.log(searchResults)
      
      onMount(async () => {
        allBusStops = await getBusStops();
        $$invalidate('searchResults', searchResults = []);

      });

      const getBusStops = async () => {
        const response = await fetch(`./bus_stops`);
        let stops = await response.json();
        stops.forEach(s => {
          s.stopNameForSearch = s.Name.toLowerCase().replace("'", "") + " (" + s.StopID + ")";
        });
        return stops
      };

      const searchBusStops = () => {
        if (query == "") {
          return $$invalidate('searchResults', searchResults = [])
        }
        else {
          return $$invalidate('searchResults', searchResults = allBusStops.filter(stop => {
            gtag('event', 'busStopSearch', {"query": query});
            return stop.stopNameForSearch.includes(query.toLowerCase().replace("'", ""))
          }))
        } 
        
      };

      const toggle = (stop) => { 
        if (relevantBusStops && stop) {
          let i = relevantBusStopNames.indexOf(stop.Name + " (" + stop.StopID + ")");
          if (i > -1) {
            $$invalidate('relevantBusStops', relevantBusStops = [...relevantBusStops.slice(0, i), ...relevantBusStops.slice(i + 1)]);
          }
          else {        
            $$invalidate('relevantBusStops', relevantBusStops = [...relevantBusStops, stop]);
          }
          localStorage.setItem("relevantBusStops", JSON.stringify(relevantBusStops));
          gtag('event', 'addBusStop', {"stop": stop});
        }
        $$invalidate('query', query = "");
        searchBusStops();
      };

    	const writable_props = ['relevantBusStops'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<BusStopPicker> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		query = this.value;
    		$$invalidate('query', query);
    	}

    	const click_handler = ({ stop }) => toggle(stop);

    	$$self.$set = $$props => {
    		if ('relevantBusStops' in $$props) $$invalidate('relevantBusStops', relevantBusStops = $$props.relevantBusStops);
    	};

    	$$self.$capture_state = () => {
    		return { allBusStops, query, searchResults, placeholder: placeholder$1, busPredictions, relevantBusStops, relevantBusStopNames };
    	};

    	$$self.$inject_state = $$props => {
    		if ('allBusStops' in $$props) allBusStops = $$props.allBusStops;
    		if ('query' in $$props) $$invalidate('query', query = $$props.query);
    		if ('searchResults' in $$props) $$invalidate('searchResults', searchResults = $$props.searchResults);
    		if ('placeholder' in $$props) $$invalidate('placeholder', placeholder$1 = $$props.placeholder);
    		if ('busPredictions' in $$props) busPredictions = $$props.busPredictions;
    		if ('relevantBusStops' in $$props) $$invalidate('relevantBusStops', relevantBusStops = $$props.relevantBusStops);
    		if ('relevantBusStopNames' in $$props) $$invalidate('relevantBusStopNames', relevantBusStopNames = $$props.relevantBusStopNames);
    	};

    	let relevantBusStopNames;

    	$$self.$$.update = ($$dirty = { relevantBusStops: 1 }) => {
    		if ($$dirty.relevantBusStops) { $$invalidate('relevantBusStopNames', relevantBusStopNames = relevantBusStops.map(stop => stop.Name + " (" + stop.StopID + ")")); }
    	};

    	return {
    		query,
    		searchResults,
    		relevantBusStops,
    		searchBusStops,
    		toggle,
    		relevantBusStopNames,
    		input_input_handler,
    		click_handler
    	};
    }

    class BusStopPicker extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, ["relevantBusStops"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "BusStopPicker", options, id: create_fragment$3.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.relevantBusStops === undefined && !('relevantBusStops' in props)) {
    			console.warn("<BusStopPicker> was created without expected prop 'relevantBusStops'");
    		}
    	}

    	get relevantBusStops() {
    		throw new Error("<BusStopPicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relevantBusStops(value) {
    		throw new Error("<BusStopPicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/App.svelte generated by Svelte v3.12.1 */

    const file$4 = "src/App.svelte";

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stop = list[i];
    	return child_ctx;
    }

    function get_each_context_1$4(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.station = list[i];
    	return child_ctx;
    }

    // (72:2) {#each relevantStations as station}
    function create_each_block_1$4(ctx) {
    	var span, t0_value = ctx.station.Name.length > 20 ? ctx.station.Name.substring(0,20) : ctx.station.Name + "", t0, t1, dispose;

    	function click_handler() {
    		return ctx.click_handler(ctx);
    	}

    	const block = {
    		c: function create() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(span, "class", "station svelte-112oy55");
    			add_location(span, file$4, 72, 4, 2235);
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
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1$4.name, type: "each", source: "(72:2) {#each relevantStations as station}", ctx });
    	return block;
    }

    // (78:0) {#if !hideBusses}
    function create_if_block_2$1(ctx) {
    	var div;

    	let each_value = ctx.relevantBusStops;

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			attr_dev(div, "class", "relevant-stations svelte-112oy55");
    			add_location(div, file$4, 78, 2, 2413);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.relevantBusStops) {
    				each_value = ctx.relevantBusStops;

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(div);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_2$1.name, type: "if", source: "(78:0) {#if !hideBusses}", ctx });
    	return block;
    }

    // (80:4) {#each relevantBusStops as stop}
    function create_each_block$4(ctx) {
    	var span, t_value = ctx.stop.Name + " (" + ctx.stop.StopID + ")" + "", t, dispose;

    	function click_handler_1() {
    		return ctx.click_handler_1(ctx);
    	}

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr_dev(span, "class", "bus-stop svelte-112oy55");
    			add_location(span, file$4, 80, 6, 2488);
    			dispose = listen_dev(span, "click", click_handler_1);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if ((changed.relevantBusStops) && t_value !== (t_value = ctx.stop.Name + " (" + ctx.stop.StopID + ")" + "")) {
    				set_data_dev(t, t_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(span);
    			}

    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block$4.name, type: "each", source: "(80:4) {#each relevantBusStops as stop}", ctx });
    	return block;
    }

    // (87:0) {#if !hideBusses}
    function create_if_block_1$2(ctx) {
    	var updating_relevantBusStops, current;

    	function busstoppicker_relevantBusStops_binding(value) {
    		ctx.busstoppicker_relevantBusStops_binding.call(null, value);
    		updating_relevantBusStops = true;
    		add_flush_callback(() => updating_relevantBusStops = false);
    	}

    	let busstoppicker_props = {};
    	if (ctx.relevantBusStops !== void 0) {
    		busstoppicker_props.relevantBusStops = ctx.relevantBusStops;
    	}
    	var busstoppicker = new BusStopPicker({
    		props: busstoppicker_props,
    		$$inline: true
    	});

    	binding_callbacks.push(() => bind(busstoppicker, 'relevantBusStops', busstoppicker_relevantBusStops_binding));

    	const block = {
    		c: function create() {
    			busstoppicker.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(busstoppicker, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var busstoppicker_changes = {};
    			if (!updating_relevantBusStops && changed.relevantBusStops) {
    				busstoppicker_changes.relevantBusStops = ctx.relevantBusStops;
    			}
    			busstoppicker.$set(busstoppicker_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(busstoppicker.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(busstoppicker.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(busstoppicker, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_1$2.name, type: "if", source: "(87:0) {#if !hideBusses}", ctx });
    	return block;
    }

    // (92:0) {#if !hideBusses}
    function create_if_block$4(ctx) {
    	var updating_relevantBusStops, current;

    	function busboard_relevantBusStops_binding(value) {
    		ctx.busboard_relevantBusStops_binding.call(null, value);
    		updating_relevantBusStops = true;
    		add_flush_callback(() => updating_relevantBusStops = false);
    	}

    	let busboard_props = {};
    	if (ctx.relevantBusStops !== void 0) {
    		busboard_props.relevantBusStops = ctx.relevantBusStops;
    	}
    	var busboard = new BusBoard({ props: busboard_props, $$inline: true });

    	binding_callbacks.push(() => bind(busboard, 'relevantBusStops', busboard_relevantBusStops_binding));

    	const block = {
    		c: function create() {
    			busboard.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(busboard, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var busboard_changes = {};
    			if (!updating_relevantBusStops && changed.relevantBusStops) {
    				busboard_changes.relevantBusStops = ctx.relevantBusStops;
    			}
    			busboard.$set(busboard_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(busboard.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(busboard.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(busboard, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block$4.name, type: "if", source: "(92:0) {#if !hideBusses}", ctx });
    	return block;
    }

    function create_fragment$4(ctx) {
    	var div, t0, t1, updating_relevantStations, updating_hideBusses, t2, t3, updating_relevantStationNames, updating_hideBusses_1, t4, t5, br, t6, button, t7_value = ctx.hideBusses ? "🚌 Show Busses too!" : "🚌 Hide Busses" + "", t7, current, dispose;

    	let each_value_1 = ctx.relevantStations;

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$4(get_each_context_1$4(ctx, each_value_1, i));
    	}

    	var if_block0 = (!ctx.hideBusses) && create_if_block_2$1(ctx);

    	function stationpicker_relevantStations_binding(value) {
    		ctx.stationpicker_relevantStations_binding.call(null, value);
    		updating_relevantStations = true;
    		add_flush_callback(() => updating_relevantStations = false);
    	}

    	function stationpicker_hideBusses_binding(value_1) {
    		ctx.stationpicker_hideBusses_binding.call(null, value_1);
    		updating_hideBusses = true;
    		add_flush_callback(() => updating_hideBusses = false);
    	}

    	let stationpicker_props = {};
    	if (ctx.relevantStations !== void 0) {
    		stationpicker_props.relevantStations = ctx.relevantStations;
    	}
    	if (ctx.hideBusses !== void 0) {
    		stationpicker_props.hideBusses = ctx.hideBusses;
    	}
    	var stationpicker = new StationPicker({
    		props: stationpicker_props,
    		$$inline: true
    	});

    	binding_callbacks.push(() => bind(stationpicker, 'relevantStations', stationpicker_relevantStations_binding));
    	binding_callbacks.push(() => bind(stationpicker, 'hideBusses', stationpicker_hideBusses_binding));

    	var if_block1 = (!ctx.hideBusses) && create_if_block_1$2(ctx);

    	function board_relevantStationNames_binding(value_2) {
    		ctx.board_relevantStationNames_binding.call(null, value_2);
    		updating_relevantStationNames = true;
    		add_flush_callback(() => updating_relevantStationNames = false);
    	}

    	function board_hideBusses_binding(value_3) {
    		ctx.board_hideBusses_binding.call(null, value_3);
    		updating_hideBusses_1 = true;
    		add_flush_callback(() => updating_hideBusses_1 = false);
    	}

    	let board_props = {};
    	if (ctx.relevantStationNames !== void 0) {
    		board_props.relevantStationNames = ctx.relevantStationNames;
    	}
    	if (ctx.hideBusses !== void 0) {
    		board_props.hideBusses = ctx.hideBusses;
    	}
    	var board = new Board({ props: board_props, $$inline: true });

    	binding_callbacks.push(() => bind(board, 'relevantStationNames', board_relevantStationNames_binding));
    	binding_callbacks.push(() => bind(board, 'hideBusses', board_hideBusses_binding));

    	var if_block2 = (!ctx.hideBusses) && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			stationpicker.$$.fragment.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			board.$$.fragment.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			t5 = space();
    			br = element("br");
    			t6 = space();
    			button = element("button");
    			t7 = text(t7_value);
    			attr_dev(div, "class", "relevant-stations svelte-112oy55");
    			add_location(div, file$4, 70, 0, 2161);
    			add_location(br, file$4, 95, 0, 2962);
    			attr_dev(button, "id", "hide-busses");
    			attr_dev(button, "class", "svelte-112oy55");
    			add_location(button, file$4, 96, 0, 2967);
    			dispose = listen_dev(button, "click", ctx.click_handler_2);
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
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(stationpicker, target, anchor);
    			insert_dev(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(board, target, anchor);
    			insert_dev(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert_dev(target, t5, anchor);
    			insert_dev(target, br, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, button, anchor);
    			append_dev(button, t7);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (changed.relevantStations) {
    				each_value_1 = ctx.relevantStations;

    				let i;
    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$4(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_1.length;
    			}

    			if (!ctx.hideBusses) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			var stationpicker_changes = {};
    			if (!updating_relevantStations && changed.relevantStations) {
    				stationpicker_changes.relevantStations = ctx.relevantStations;
    			}
    			if (!updating_hideBusses && changed.hideBusses) {
    				stationpicker_changes.hideBusses = ctx.hideBusses;
    			}
    			stationpicker.$set(stationpicker_changes);

    			if (!ctx.hideBusses) {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_1$2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();
    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});
    				check_outros();
    			}

    			var board_changes = {};
    			if (!updating_relevantStationNames && changed.relevantStationNames) {
    				board_changes.relevantStationNames = ctx.relevantStationNames;
    			}
    			if (!updating_hideBusses_1 && changed.hideBusses) {
    				board_changes.hideBusses = ctx.hideBusses;
    			}
    			board.$set(board_changes);

    			if (!ctx.hideBusses) {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block$4(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(t5.parentNode, t5);
    				}
    			} else if (if_block2) {
    				group_outros();
    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});
    				check_outros();
    			}

    			if ((!current || changed.hideBusses) && t7_value !== (t7_value = ctx.hideBusses ? "🚌 Show Busses too!" : "🚌 Hide Busses" + "")) {
    				set_data_dev(t7, t7_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(stationpicker.$$.fragment, local);

    			transition_in(if_block1);

    			transition_in(board.$$.fragment, local);

    			transition_in(if_block2);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(stationpicker.$$.fragment, local);
    			transition_out(if_block1);
    			transition_out(board.$$.fragment, local);
    			transition_out(if_block2);
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

    			if (if_block0) if_block0.d(detaching);

    			if (detaching) {
    				detach_dev(t1);
    			}

    			destroy_component(stationpicker, detaching);

    			if (detaching) {
    				detach_dev(t2);
    			}

    			if (if_block1) if_block1.d(detaching);

    			if (detaching) {
    				detach_dev(t3);
    			}

    			destroy_component(board, detaching);

    			if (detaching) {
    				detach_dev(t4);
    			}

    			if (if_block2) if_block2.d(detaching);

    			if (detaching) {
    				detach_dev(t5);
    				detach_dev(br);
    				detach_dev(t6);
    				detach_dev(button);
    			}

    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$4.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	
      
      let relevantStations = [];
      let relevantStationNames = "";
      let relevantBusStops = [];

      let hideBusses;

      
      if (localStorage.getItem("relevantStations")) {
          $$invalidate('relevantStations', relevantStations = JSON.parse(localStorage.getItem("relevantStations")));
      }

      if (localStorage.getItem("relevantBusStops")) {
          $$invalidate('relevantBusStops', relevantBusStops = JSON.parse(localStorage.getItem("relevantBusStops")));
      }

      if (localStorage.getItem("hideBusses")) {
          $$invalidate('hideBusses', hideBusses = JSON.parse(localStorage.getItem("hideBusses")));
      }
      else {
        $$invalidate('hideBusses', hideBusses = true);
        localStorage.setItem("hideBusses", JSON.stringify(hideBusses));
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

      const toggleBusStop = (stop) => { 
        console.log("Toggle");   
        if (relevantBusStops && stop) {
          let i = relevantBusStops.indexOf(stop);
          console.log(i);
          if (i > -1) {
            console.log("Remove stop");        
            $$invalidate('relevantBusStops', relevantBusStops = [...relevantBusStops.slice(0, i), ...relevantBusStops.slice(i + 1)]);
            gtag('event', 'removeBusStop', {"stop": stop, "button": "top-button"});
          }
          else {
            $$invalidate('relevantBusStops', relevantBusStops = [...relevantBusStops, stop]);
          }
          localStorage.setItem("relevantBusStops", JSON.stringify(relevantBusStops));
        }
      };

      const toggleBusMode = () => {
        $$invalidate('hideBusses', hideBusses = !hideBusses);
        localStorage.setItem("hideBusses", JSON.stringify(hideBusses));
      };

    	const click_handler = ({ station }) => toggle(station);

    	const click_handler_1 = ({ stop }) => toggleBusStop(stop);

    	function stationpicker_relevantStations_binding(value) {
    		relevantStations = value;
    		$$invalidate('relevantStations', relevantStations);
    	}

    	function stationpicker_hideBusses_binding(value_1) {
    		hideBusses = value_1;
    		$$invalidate('hideBusses', hideBusses);
    	}

    	function busstoppicker_relevantBusStops_binding(value) {
    		relevantBusStops = value;
    		$$invalidate('relevantBusStops', relevantBusStops);
    	}

    	function board_relevantStationNames_binding(value_2) {
    		relevantStationNames = value_2;
    		$$invalidate('relevantStationNames', relevantStationNames), $$invalidate('relevantStations', relevantStations);
    	}

    	function board_hideBusses_binding(value_3) {
    		hideBusses = value_3;
    		$$invalidate('hideBusses', hideBusses);
    	}

    	function busboard_relevantBusStops_binding(value) {
    		relevantBusStops = value;
    		$$invalidate('relevantBusStops', relevantBusStops);
    	}

    	const click_handler_2 = () => toggleBusMode();

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ('relevantStations' in $$props) $$invalidate('relevantStations', relevantStations = $$props.relevantStations);
    		if ('relevantStationNames' in $$props) $$invalidate('relevantStationNames', relevantStationNames = $$props.relevantStationNames);
    		if ('relevantBusStops' in $$props) $$invalidate('relevantBusStops', relevantBusStops = $$props.relevantBusStops);
    		if ('hideBusses' in $$props) $$invalidate('hideBusses', hideBusses = $$props.hideBusses);
    	};

    	$$self.$$.update = ($$dirty = { relevantStations: 1, relevantBusStops: 1 }) => {
    		if ($$dirty.relevantStations) { $$invalidate('relevantStationNames', relevantStationNames = relevantStations.map(station => station.Name)); }
    		if ($$dirty.relevantBusStops) { $$invalidate('relevantBusStops', relevantBusStops); }
    	};

    	return {
    		relevantStations,
    		relevantStationNames,
    		relevantBusStops,
    		hideBusses,
    		toggle,
    		toggleBusStop,
    		toggleBusMode,
    		click_handler,
    		click_handler_1,
    		stationpicker_relevantStations_binding,
    		stationpicker_hideBusses_binding,
    		busstoppicker_relevantBusStops_binding,
    		board_relevantStationNames_binding,
    		board_hideBusses_binding,
    		busboard_relevantBusStops_binding,
    		click_handler_2
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, []);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "App", options, id: create_fragment$4.name });
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
