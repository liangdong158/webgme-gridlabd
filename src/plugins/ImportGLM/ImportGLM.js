/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Mon Apr 04 2016 15:12:25 GMT-0700 (PDT).
 */

define([
    'plugin/PluginConfig',
    'plugin/PluginBase',
    'gridlabd/meta',
    'q'
], function (
    PluginConfig,
    PluginBase,
    MetaTypes,
    Q) {
    'use strict';

    /**
     * Initializes a new instance of ImportGLM.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin ImportGLM.
     * @constructor
     */
    var ImportGLM = function () {
        // Call base class' constructor.
        PluginBase.call(this);

        this.metaTypes = MetaTypes;
    };

    // Prototypal inheritance from PluginBase.
    ImportGLM.prototype = Object.create(PluginBase.prototype);
    ImportGLM.prototype.constructor = ImportGLM;

    /**
     * Gets the name of the ImportGLM.
     * @returns {string} The name of the plugin.
     * @public
     */
    ImportGLM.prototype.getName = function () {
        return 'ImportGLM';
    };

    /**
     * Gets the semantic version (semver.org) of the ImportGLM.
     * @returns {string} The version of the plugin.
     * @public
     */
    ImportGLM.prototype.getVersion = function () {
        return '0.1.0';
    };

    ImportGLM.prototype.getConfigStructure = function() {
        return [
            {
                'name': 'glmFile',
                'displayName': 'Gridlab-D Model File',
                'description': 'GLM file for loading as a WebGME Power System Model.',
                'value': '',
                'valueType': 'asset',
                'readOnly': false
            }
        ];
    };

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    ImportGLM.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
        nodeObject;

        self.updateMETA(self.metaTypes);

        // Default fails
        self.result.success = false;

	// fill this out before creating the WebGME nodes
	self.newModel = {
	    children: [],
	    attributes: {}
	};

	var currentConfig = self.getCurrentConfig(),
	glmFileHash = currentConfig.glmFile;

        // Using the coreAPI to make changes.
        nodeObject = self.activeNode;

	self.blobClient.getMetadata(glmFileHash)
	    .then(function(glmMetaData) {
		var splitName = glmMetaData.name.split(".");
		var newName = "";
		for (var i=0;i<splitName.length-1;i++) {
		    newName += splitName[i];
		}
		self.modelName = newName;
		self.newModel.name = newName;
		//self.logger.error('loaded model: ' + self.modelName);
	    })
	    .then(function() {
		return self.blobClient.getObjectAsString(glmFileHash)
	    })
	    .then(function(glmFile) {
		return self.parseObjectsFromGLM(glmFile);
	    })
	    .then(function() {
		return self.createModelArtifacts();
	    })
	    .then(function() {
		// This will save the changes. If you don't want to save;
		// exclude self.save and call callback directly from this scope.
		return self.save('ImportGLM updated model.');
	    })
	    .then(function() {
		self.result.setSuccess(true);
		callback(null, self.result);
	    })
	    .catch(function(err) {
		self.logger.error('ERROR:: '+err);
		self.result.setSuccess(false);
		callback(null, self.result);
	    });
    };

    ImportGLM.prototype.parseObjectsFromGLM = function(glmFile) {
	// fill out self.newModel
	var self = this;
	self.parseHeader(glmFile);
	self.parseObject(glmFile, self.newModel);
	//self.logger.error(JSON.stringify(self.newModel,null,2));
    };

    ImportGLM.prototype.parseHeader = function(str) {
	var self = this;
	var regex = /#(\S+)\s+(\S+)\s*=\s*([\S ]+)(?:;)?/gi;
	var matches = regex.exec(str);
	while (matches != null) {
	    var cmd = matches[1];
	    var variable = matches[2];
	    var value = matches[3].replace(/;/gi,'').replace(/'/gi,'');
	    self.newModel.attributes[variable] = value;
	    //self.logger.error('got ' + cmd + ' for variable ' + variable + ' and value ' + value);
	    matches = regex.exec(str);
	}
	regex = /^module (\w+);$/gim;
	matches = regex.exec(str);
	while (matches != null) {
	    var moduleName = matches[1];
	    var obj = {
		name: moduleName,
		type: 'module',
		base: 'module',
		children: [],
		attributes: {},
		pointers: {}
	    };
	    self.newModel.children.push(obj);
	    matches = regex.exec(str);
	}
    };

    ImportGLM.prototype.parseClock = function(str, obj) {
	var self = this;
	var patterns = [
		/(timestamp)\s+'([^\/\n\r\v]*)';/gi,
		/(stoptime)\s+'([^\/\n\r\v]*)';/gi,
		/(timezone)\s+([^\/\n\r\v]*);/gi
	];

	patterns.map(function(pattern) {
	    var matches = pattern.exec(str);
	    while (matches != null) {
		var key = matches[1];
		var value = matches[2];
		obj.attributes[key] = value;
		matches = pattern.exec(str);
	    }
	});
	self.newModel.children.push(obj);
    };

    ImportGLM.prototype.parseSchedule = function(str, obj) {
	var self = this;
	var lines = str.split('\n');
	obj.entries = [];
	lines.map(function(line) {
	    var pattern = /([\s]+[\d\*\.]+[\-\.\d]*)+/gi; 
	    var matches = pattern.exec(line);
	    if (matches) {
		var splits = matches[0].split(new RegExp(" |\t|\s|;",'g')).filter(function(obj) {return obj.length > 0;});
		if ( splits.length >=5 ) {
		    var entry = {
			minutes: splits[0],
			hours: splits[1],
			days: splits[2],
			months: splits[3],
			weekdays: splits[4],
		    };
		    if (splits.length > 5)
			entry.value = splits[5];
		    obj.entries.push(entry)
		}
		else {
		    self.logger.error(line);
		    self.logger.error(matches);
		    self.logger.error(splits);
		}
	    }
	});
	self.newModel.children.push(obj);
    };

    ImportGLM.prototype.saveSchedule = function(obj, parentNode) {
	var self = this;
	// save obj as node here (set the properties of the schedule)
	var schedNode = self.core.createNode({parent: parentNode, base: self.META.schedule});
	self.core.setAttribute(schedNode, 'name', obj.name);
	var i =0;
	obj.entries.map(function(entry) {
	    var entryNode = self.core.createNode({parent: schedNode, base: self.META.schedule_entry});
	    self.core.setAttribute(entryNode, 'name', 'Entry ' + i++);
	    //self.logger.error(JSON.stringify(entry, null, 2));
	    for (var a in entry) {
		var val = entry[a];
		self.core.setAttribute(entryNode, a, val);
	    }
	});
    };

    ImportGLM.prototype.parseMultiRecorder = function(str, obj) {
	var self = this;
	var splitString = /[\s;]+/gi;
	var splits;
	var lines = str.split('\n');
	lines.map(function(line) {
	    splits = line.split(splitString)
		.filter(function(obj) { return obj.length > 0; });
	    if ( splits.length > 0 && splits[0].indexOf('/') == -1 ) {
		obj.attributes[splits[0]] = splits[1];
	    }
	});
	self.newModel.children.push(obj);
    };

    ImportGLM.prototype.parseClass = function(str, obj) {
	var self = this;
	var splitString = /[\s;]+/gi;
	var splits;
	var lines = str.split('\n');
	lines.map(function(line) {
	    splits = line.split(splitString)
		.filter(function(obj) { return obj.length > 0; });
	    if ( splits.length > 0 && splits[0].indexOf('/') == -1 ) {
		obj.attributes[splits[1]] = splits[0];
	    }
	});
	self.newModel.children.push(obj);
    };

    ImportGLM.prototype.parseObject = function(str, parent) {
	var self = this;
	var splitString = /[\s\{]+/gi;
	var submodel_str = '';
	var submodels = [];
	var currentObj = undefined;
	var depth = 0;
	var lines = str.split('\n');
	var splits;
	lines.map(function(line) {
	    if ( !line ) return;
	    if ( line.indexOf('{') > -1 ) {
		if ( depth == 0 ) {
		    splits = line.split(splitString).filter(function(obj) { return obj.length > 0; });
		    if ( splits.length > 0 && splits[0].indexOf('/') == -1 ) {
			var base = splits[0];
			var type;
			var name;
			if (splits[1] && splits[1].indexOf(':') > -1) {
			    var tmp = splits[1].split(':');
			    type = tmp[0];
			    name = tmp[1];
			}
			else if (splits[1]) {
			    type = splits[1];
			}
			currentObj = {
			    type: type,
			    base: base,
			    name: name,
			    children: [],
			    attributes: {},
			    pointers: {}
			};
		    }
		}
		else {
		    submodel_str += line +'\n';
		}
		depth += 1;
	    }
	    else if ( line.indexOf('}') > -1 ) {
		depth -= 1;
		if ( depth == 0 ) {
		    if (currentObj) {
			if (currentObj.base == 'clock') {
			    currentObj.type = currentObj.base;
			    currentObj.attributes = {};
			    self.parseClock(submodel_str, currentObj);
			}
			else if (currentObj.base == 'schedule') {
			    currentObj.name = currentObj.type;
			    currentObj.type = currentObj.base;
			    currentObj.attributes = {};
			    self.parseSchedule(submodel_str, currentObj);
			}
			else if (currentObj.base == 'class') {
			    currentObj.name = currentObj.type;
			    currentObj.type = currentObj.base;
			    currentObj.attributes = {};
			    self.parseClass(submodel_str, currentObj);
			}
			else if (currentObj.type == 'multi_recorder') {
			    currentObj.name = currentObj.type;
			    currentObj.type = currentObj.base;
			    currentObj.attributes = {};
			    self.parseMultiRecorder(submodel_str, currentObj);
			}
			else {
			    submodels.push({string:submodel_str, object:currentObj});
			}
			currentObj = undefined;
			submodel_str = '';
		    }
		}
		else {
		    submodel_str += line + '\n';
		}
	    }
	    else {
		if (depth >= 1) {
		    // parse property here
		    splits = line.split(/;/gi).filter(function(s) { return s.length > 0; });
		    //self.logger.error(splits);
		    if (splits && splits[0].indexOf('//') == -1) { // don't want comments
			if (depth == 1) {
			    var newSplits = splits[0].split(/\s/g).filter(function(s) { return s.length > 0; });
			    var attr = newSplits[0];
			    var val = newSplits.slice(1).join(' ').replace(/"/g,'');
			    if (attr=='name') {
				currentObj.name = val;
			    }
			    currentObj.attributes[attr] = val;
			}
			submodel_str += line + '\n';
		    }
		}
	    }
	});
	submodels.map(function(subModel) {
	    self.parseObject(subModel.string, subModel.object);
	    if (parent !== self.newModel)
		subModel.object.attributes.parent = parent.name;
	    self.newModel.children.push(subModel.object);
	});
    };

    ImportGLM.prototype.saveObject = function(obj, parent) {
	var self = this;
	if ( obj.type == 'schedule' ){
	    self.saveSchedule(obj, parent);
	}
	else if ( obj.type ) {
	    var newNode = self.core.createNode({parent: parent, base: self.META[obj.type]});
	    if (obj.name) {
		self.core.setAttribute(newNode, 'name', obj.name);
	    }
	    for (var a in obj.attributes) {
		var val = obj.attributes[a];
		self.core.setAttribute(newNode, a, val);
	    }
	    obj.node = newNode;
	    obj.children.map(function(child) {
		self.saveObject(child, newNode);
	    });
	}
    };

    ImportGLM.prototype.getObjectName = function(str) {
	var self = this;
	var name = str;
	if ( name && name.indexOf(':') > -1 ) {
	    name = name.split(':')[1];
	}
	return name;
    };

    ImportGLM.prototype.objectTypeToPointerMap = function(objType) {
	var self = this;
	// each entry in each array is an array of [attr name , pointer name]
	var dict = {
	    'underground_line': [
		['from','src'],
		['to','dst'],
		['configuration','configuration'],
	    ],
	    'overhead_line': [
		['from','src'],
		['to','dst'],
		['configuration','configuration'],
	    ],
	    'triplex_line': [
		['from','src'],
		['to','dst'],
		['configuration','configuration'],
	    ],
	    'transformer': [
		['from','src'],
		['to','dst'],
		['configuration','configuration'],
	    ],
	    'regulator': [
		['from','src'],
		['to','dst'],
		['configuration','configuration'],
		['sense_node','sense_node'],
	    ],
	    'line_configuration': [
		['conductor_A','conductor_A'],
		['conductor_B','conductor_B'],
		['conductor_C','conductor_C'],
		['conductor_N','conductor_N'],
		['spacing','spacing'],
	    ],
	    'triplex_line_configuration': [
		['conductor_1','conductor_1'],
		['conductor_2','conductor_2'],
		['conductor_N','conductor_N'],
		['spacing','spacing'],
	    ],
	    'switch': [
		['from','src'],
		['to','dst'],
	    ],
	    'controller': [
		['market','market'],
	    ],
	};
	return dict[objType];
    };

    ImportGLM.prototype.resolveReferences = function(obj, modelNode) {
	var self = this;
	if ( obj.attributes.parent ) {
	    var src = obj.node;
	    var p = self.getObjectName(obj.attributes.parent);
	    var dst = self.newModel.children.filter(function(c) { return c.name == p; })[0].node;
	    var link = self.core.createNode({parent:modelNode, base: self.META.FCO});
	    self.core.setAttribute(link, 'name', 'parent');
	    self.core.setPointer(link, 'src', src);
	    self.core.setPointer(link, 'dst', dst);
	    self.core.delAttribute(obj.node, 'parent');
	}
	var pointerAttrs = self.objectTypeToPointerMap(obj.type);
	if (pointerAttrs) {
	    pointerAttrs.map(function(pointerAttr) {
		var attrName = pointerAttr[0];
		var pointerName = pointerAttr[1];
		var dst = self.getObjectName(obj.attributes[attrName]);
		if (dst) {
		    var dstObj = self.newModel.children.filter(function(c) { return c.name == dst; })[0];
		    if ( dstObj ) {
			self.core.setPointer(obj.node, pointerName, dstObj.node);
			self.core.delAttribute(obj.node, attrName);
		    }
		}
	    });
	}
    };

    ImportGLM.prototype.createModelArtifacts = function() {
	// use self.newModel
	var self = this;
	var fcoNode = self.core.getBaseRoot(self.activeNode);
	var modelMetaNode = self.META.Model;
	var modelNode = self.core.createNode({parent: self.activeNode, base: modelMetaNode});
	self.core.setAttribute(modelNode, 'name', self.newModel.name);
	for (var ai in self.newModel.attributes) {
	    var val = self.newModel.attributes[ai];
	    self.core.setAttribute(modelNode, ai, val);
	}
	self.newModel.children.map(function(obj) {
	    self.saveObject(obj, modelNode);
	});
	self.newModel.children.map(function(obj) {
	    self.resolveReferences(obj, modelNode);
	});
    };

    return ImportGLM;
});
