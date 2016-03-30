var Reactive;
(function (Reactive) {
    var StreamController = (function () {
        function StreamController() {
            this.stream = new Stream();
        }
        StreamController.prototype.add = function (evt) {
            this.stream.trigger_event(evt);
        };
        StreamController.prototype.error = function (err) {
            this.stream.trigger_error(err);
        };
        StreamController.prototype.close = function (reason) {
            this.stream.trigger_close(reason);
        };
        return StreamController;
    }());
    Reactive.StreamController = StreamController;
    var Stream = (function () {
        function Stream() {
            this.observers = [];
            this.closed = false;
        }
        Stream.prototype.toString = function () {
            return "#<Stream>";
        };
        Stream.prototype.add_observer = function (observer) {
            this.observers.push(observer);
        };
        // TODO: module-private?
        Stream.prototype.remove_observer = function (observer) {
            var ind;
            ind = this.observers.indexOf(observer);
            if (ind != -1) {
                this.observers.splice(ind, 1);
            }
        };
        // TODO: these should really be module-private
        Stream.prototype.trigger_event = function (event) {
            if (!this.closed) {
                this.observers.map(function (observer) { return observer.on_event(event); });
            }
            else {
                throw 'closed';
            }
        };
        Stream.prototype.trigger_error = function (error) {
            if (!this.closed) {
                this.observers.map(function (observer) { return observer.on_error(error); });
            }
            else {
                throw 'closed';
            }
        };
        Stream.prototype.trigger_close = function (reason) {
            this.closed = true;
            return this.observers.map(function (observer) { return observer.on_close(reason); });
        };
        Stream.prototype.listen = function (event_cb, error_cb, close_cb) {
            var observer = new Observer(this, event_cb, error_cb, close_cb);
            this.add_observer(observer);
            return observer;
        };
        Stream.prototype.map = function (func) {
            var controller = new StreamController();
            this.listen(function (event) { return controller.add(func(event)); }, function (error) { return controller.error(error); }, function (reason) { return controller.close(reason); });
            return controller.stream;
        };
        Stream.prototype.distinct = function () {
            var controller = new StreamController();
            var lastEvent = null;
            this.listen(function (event) {
                if (event !== lastEvent) {
                    lastEvent = event;
                    controller.add(event);
                }
            }, function (err) { return controller.error(err); }, function (reason) { return controller.close(reason); });
            return controller.stream;
        };
        Stream.prototype.filter = function (func) {
            var controller = new StreamController();
            this.listen(function (event) {
                if (func(event)) {
                    controller.add(event);
                }
            }, function (error) { return controller.error(error); }, function (reason) { return controller.close(reason); });
            return controller.stream;
        };
        // TODO
        //        fold(initial : B, func : (A, B) => B) : Signal<B> {
        //            var signal;
        //            signal = new Stream(initial);
        //            this.listen((event) => signal.trigger_event(func(signal.value, event)), (error) => signal.trigger_error(error), (reason) => signal.trigger_close(reason));
        //            return signal;
        //        }
        /* TODO
        distinct() {
            var dist, last_evt;
            dist = new Stream(this.value);
            last_evt = this.value;
            this.listen(((event) => {
                if (event !== last_evt) {
                    last_evt = event;
                    return dist.trigger_event(event);
                }
            }), (error) => dist.trigger_error(error), (reason) => dist.trigger_close(close));
            return dist;
        }
    
        throttle(interval) {
            var last_time, throttled;
            last_time = new Date().getTime();
            throttled = new Stream(this.value);
            this.listen(((evt) => {
                var now;
                now = new Date().getTime();
                if (now >= last_time + interval) {
                    last_time = now;
                    return throttled.trigger_event(evt);
                }
            }), (error) => throttled.trigger_error(error), (reason) => throttled.trigger_close(reason));
            return throttled;
        }
        */
        Stream.prototype.log = function (name) {
            var repr = name ? name : this.toString();
            this.listen(function (event) { return console.log(repr + ':event:', event); }, function (error) { return console.log(repr + ':error:', error); }, function (reason) { return console.log(repr + ':close:', reason); });
        };
        return Stream;
    }());
    Reactive.Stream = Stream;
    var Observer = (function () {
        function Observer(stream, event_cb, error_cb, close_cb) {
            this.stream = stream;
            this.event_cb = event_cb;
            this.error_cb = error_cb;
            this.close_cb = close_cb;
        }
        Observer.prototype.toString = function () {
            return "#<Observer>";
        };
        Observer.prototype.on_event = function (event) {
            this.event_cb(event);
        };
        Observer.prototype.on_error = function (error) {
            if (this.error_cb) {
                this.error_cb(error);
            }
            else {
                throw error;
            }
        };
        Observer.prototype.on_close = function (reason) {
            if (this.close_cb) {
                this.close_cb(reason);
            }
        };
        Observer.prototype.unsubscribe = function () {
            this.stream.remove_observer(this);
        };
        return Observer;
    }());
    Reactive.Observer = Observer;
    var SignalController = (function () {
        function SignalController(initialValue) {
            this.updates = new StreamController();
            this.signal = new Signal(initialValue, this.updates.stream);
        }
        SignalController.prototype.update = function (newValue) {
            if (this.signal.value !== newValue) {
                this.signal.value = newValue;
                this.updates.add(newValue);
            }
        };
        return SignalController;
    }());
    Reactive.SignalController = SignalController;
    var Signal = (function () {
        function Signal(value, updates) {
            this.value = value;
            this.updates = updates;
        }
        /* TODO
        static fold<B>(initialValue : B, stream : Stream<A>, combiner : (A, B) => B) : Signal<B> {
            var controller = new SignalController(initialValue);
            stream.listen((evt) {
            var oldValue = controller.signal.value;
            controller.update(combiner(oldValue, evt));
            });
            return controller.signal;
        }
        */
        Signal.constant = function (value) {
            return new Signal(value, new StreamController().stream);
        };
        Signal.derived = function (signals, comp) {
            var _this = this;
            var recompute = function () { return comp.apply(_this, [signals.map(function (s) { return s.value; })]); };
            var controller = new SignalController(recompute());
            signals.forEach(function (signal) {
                signal.updates.listen(function (_) {
                    return controller.update(recompute());
                });
            });
            return controller.signal;
        };
        Signal.or = function (signals) {
            return Signal.derived(signals, function (values) {
                // this is a fold...
                var val = false;
                for (var i = 0; i < values.length; i++) {
                    val = val || values[i];
                }
                return val;
            });
        };
        Signal.prototype.map = function (mapper) {
            return Signal.derived([this], function (values) { return mapper(values[0]); });
        };
        Signal.prototype.log = function (tag) {
            if (tag == undefined) {
                tag = "<#Signal>";
            }
            console.log(tag + ':initial:', this.value);
            this.updates.log(tag);
        };
        return Signal;
    }());
    Reactive.Signal = Signal;
    var Completer = (function () {
        function Completer() {
            this.future = new Future();
        }
        Completer.prototype.complete = function (value) {
            this.future.trigger(value);
        };
        Completer.prototype.error = function (err) {
            this.future.trigger_error(err);
        };
        return Completer;
    }());
    Reactive.Completer = Completer;
    var Future = (function () {
        function Future() {
            this.completed = false;
            this.observers = [];
        }
        Future.all = function (futures) {
            var comp = new Completer();
            var completed = 0;
            var results = [];
            range(futures.length).forEach(function (i) {
                results.push(null);
                futures[i].then(function (val) {
                    results[i] = val;
                    completed++;
                    if (completed == futures.length) {
                        comp.complete(results);
                    }
                    return null;
                }, function (err) { return comp.error(err); });
            });
            return comp.future;
        };
        Future.prototype.trigger = function (value) {
            if (this.completed) {
                throw "already completed";
            }
            else {
                this.completed = true;
                this.value = value;
                this.observers.map(function (obs) { return obs.on_complete(value); });
            }
        };
        Future.prototype.trigger_error = function (err) {
            if (this.completed) {
                throw "already completed";
            }
            else {
                this.completed = true;
                this.observers.map(function (obs) {
                    if (obs.on_error) {
                        obs.on_error(err);
                    }
                    else {
                        throw err;
                    }
                });
            }
        };
        Future.prototype.then = function (handler, err_handler) {
            var comp = new Completer();
            // TODO: ...
            var on_error;
            if (err_handler) {
                on_error = err_handler;
            }
            else {
                on_error = function (err) { return comp.error(err); };
            }
            this.observers.push(new FutureObserver(function (value) { return comp.complete(handler(value)); }, on_error));
            return comp.future;
        };
        Future.prototype.map = function (fun) {
            var comp = new Completer();
            this.then(function (value) {
                comp.complete(fun(value));
                return null;
            });
            return comp.future;
        };
        return Future;
    }());
    Reactive.Future = Future;
    var FutureObserver = (function () {
        function FutureObserver(on_complete, on_error) {
            this.on_complete = on_complete;
            this.on_error = on_error;
        }
        return FutureObserver;
    }());
    Reactive.FutureObserver = FutureObserver;
})(Reactive || (Reactive = {}));
function range(num) {
    var result = [];
    for (var i = 0; i < num; i++) {
        result.push(i);
    }
    return result;
}
