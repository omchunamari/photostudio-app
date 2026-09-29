/** People a transaction can be attached to: employees and freelancers, keyed "employee:<uid>" / "freelancer:<id>". */
export function buildPersonOptions(employees = [], freelancers = []) {
  const emps = employees
    .filter((e) => e.status !== "inactive" && e.status !== "resigned")
    .map((e) => ({ value: `employee:${e.uid}`, label: e.name, hint: e.department || "", group: "Employees" }));
  const frs = freelancers.map((f) => ({ value: `freelancer:${f.id}`, label: f.name, hint: f.skill || "", group: "Freelancers" }));
  return [...emps, ...frs];
}

export function resolvePerson(key, employees = [], freelancers = []) {
  if (!key) return { personUid: null, personName: null, personType: null };
  const [type, id] = key.split(":");
  if (type === "employee") {
    const e = employees.find((x) => x.uid === id);
    return { personUid: id, personName: e?.name || "", personType: "employee" };
  }
  const f = freelancers.find((x) => x.id === id);
  return { personUid: id, personName: f?.name || "", personType: "freelancer" };
}

export function personKeyOf(tx) {
  return tx?.personUid && tx?.personType ? `${tx.personType}:${tx.personUid}` : "";
}
