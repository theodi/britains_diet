#!/usr/bin/python
# -*- encoding: utf-8 -*-
from __future__ import division

import csv
import re
import sys

def clean(value):
	value = re.sub(r",", "", value)
	if not re.match(r"^\d*(?:\.\d+)?$", value):
		print >>sys.stderr, "Unrecognised value: " + value
	return value

w = csv.writer(sys.stdout)

filename = sys.argv[1]
with open(filename, 'r') as f:
	r = csv.reader(f)
	for i in range(7): next(r) # Skip the first seven rows

	header = next(r)
	years = [ y for y in enumerate(header) if re.match(r"^\d\d\d\d(-\d\d)?$", y[1]) ]
	w.writerow([ "code", "desc1", "desc2",  "desc3", "desc4", "unit" ] + [ y[1][:4] for y in years ])

	prev_desc1, prev_desc2, prev_desc3 = None, None, None
	for row in r:
		code, desc1, desc2, desc3, desc4, unit = row[:6]
		if code == "" and desc1 == "": break

		if not desc1:
			desc1 = prev_desc1
			if not desc2:
				desc2 = prev_desc2
				if not desc3:
					desc3 = prev_desc3

		w.writerow([ code, desc1, desc2, desc3, desc4, unit ] + [ clean(row[y[0]]) for y in years ])

		prev_desc1, prev_desc2, prev_desc3 = desc1, desc2, desc3
